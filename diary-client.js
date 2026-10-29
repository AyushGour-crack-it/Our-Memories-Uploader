(() => {
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const BUCKET = 'diary-media';
  const config = window.DIARY_CONFIG || {};
  const resumableEndpoint = (() => {
    try {
      const projectUrl = new URL(config.supabaseUrl);
      const project = projectUrl.hostname.match(/^([^.]+)\.supabase\.co$/);
      const storageOrigin = project ? `https://${project[1]}.storage.supabase.co` : projectUrl.origin;
      return `${storageOrigin}/storage/v1/upload/resumable`;
    } catch { return null; }
  })();
  const configured = Boolean(
    config.supabaseUrl &&
    config.publishableKey &&
    window.supabase?.createClient,
  );
  const client = configured
    ? window.supabase.createClient(config.supabaseUrl, config.publishableKey)
    : null;

  const requireConfigured = () => {
    if (!client) throw new Error('The private diary backend has not been connected yet. Follow backend/SETUP.md to finish setup.');
    return client;
  };

  const isNetworkFailure = (error) => {
    const message = `${error?.name || ''} ${error?.message || ''} ${error?.cause?.message || ''}`.toLowerCase();
    return ['failed to fetch', 'networkerror', 'network request failed', 'load failed', 'fetch failed'].some((phrase) => message.includes(phrase));
  };

  const isDuplicateError = (error) => String(error?.statusCode || error?.code || '').includes('409') ||
    ['duplicate', 'already exists', 'unique constraint'].some((phrase) => `${error?.name || ''} ${error?.message || ''}`.toLowerCase().includes(phrase));

  const uncertainNetworkError = (stage) => {
    const error = new Error(`The connection dropped while ${stage}. Check the diary before trying again so we don’t save the same memory twice.`);
    error.uncertainSave = true;
    return error;
  };

  const uploadResumably = (file, storagePath, contentType, accessToken, onProgress) => new Promise((resolve, reject) => {
    const TusUpload = window.tus?.Upload;
    if (!TusUpload || window.tus?.isSupported === false || !resumableEndpoint) {
      reject(new Error('Resumable video upload could not start. Refresh the uploader and try again.'));
      return;
    }
    try {
      const upload = new TusUpload(file, {
        endpoint: resumableEndpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: { authorization: `Bearer ${accessToken}` },
        uploadDataDuringCreation: true,
        storeFingerprintForResuming: false,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: BUCKET,
          objectName: storagePath,
          contentType,
          cacheControl: '3600',
        },
        chunkSize: 6 * 1024 * 1024,
        onError: reject,
        onProgress: (uploaded, total) => onProgress(total ? Math.min(100, Math.floor(uploaded / total * 100)) : 0),
        onSuccess: resolve,
      });
      upload.start();
    } catch (error) { reject(error); }
  });

  const getMemberSession = async () => {
    const supabaseClient = requireConfigured();
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData.session;
    if (!session) return null;

    const { data: member, error: memberError } = await supabaseClient
      .from('diary_members')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (memberError || !member) {
      await supabaseClient.auth.signOut();
      throw new Error('This account has not been invited to this diary. Ask the owner to add it.');
    }
    return session;
  };

  const signInWithEmail = async (email, returnPath) => {
    const supabaseClient = requireConfigured();
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}${returnPath}`,
      },
    });
    if (error) throw error;
  };

  const listMemories = async () => {
    const supabaseClient = requireConfigured();
    const session = await getMemberSession();
    if (!session) return null;
    const { data, error } = await supabaseClient
      .from('memories')
      .select('id,title,media_type,memory_date,caption,storage_path,original_name,content_type,file_size,created_by,created_at')
      .order('memory_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) throw error;

    return Promise.all((data || []).map(async (memory) => {
      const { data: signed, error: signedError } = await supabaseClient
        .storage.from(BUCKET).createSignedUrl(memory.storage_path, 60 * 60);
      if (signedError) return { ...memory, signed_url: null, viewer_error: signedError.message };
      return { ...memory, signed_url: signed.signedUrl };
    }));
  };

  const uploadMemory = async (file, metadata, session, onStage = () => {}) => {
    const supabaseClient = requireConfigured();
    if (!session?.user?.id) throw new Error('Sign in before adding a memory.');
    if (!file || !file.size) throw new Error('Choose a file first.');
    if (file.size > MAX_FILE_SIZE) throw new Error('This free diary accepts files up to 50 MB. Choose a smaller copy; this file has not been uploaded.');

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'memory-file';
    const storagePath = `${session.user.id}/${crypto.randomUUID()}-${safeName}`;
    const contentType = file.type || 'application/octet-stream';
    const storage = supabaseClient.storage.from(BUCKET);
    const uploadOptions = {
      cacheControl: '3600',
      contentType,
      upsert: false,
    };
    const attemptUpload = async () => {
      try { return await storage.upload(storagePath, file, uploadOptions); }
      catch (error) { return { error }; }
    };
    const verifyStoredFile = async () => {
      onStage('checking');
      let data;
      let error;
      try { ({ data, error } = await storage.createSignedUrl(storagePath, 60)); }
      catch (caught) { error = caught; }
      if (!error && data?.signedUrl) return true;
      if (isNetworkFailure(error)) throw uncertainNetworkError('checking whether the file arrived');
      if (!error || /not found|404/i.test(`${error.statusCode || ''} ${error.message || ''}`)) return false;
      throw error;
    };

    const shouldUseResumable = metadata.mediaType === 'video' || file.size >= 6 * 1024 * 1024;
    let uploadError = null;
    if (shouldUseResumable) {
      onStage('resumable');
      try {
        await uploadResumably(file, storagePath, contentType, session.access_token, (percent) => onStage('upload-progress', percent));
      } catch (error) { uploadError = error; }
      if (uploadError) {
        if (await verifyStoredFile()) uploadError = null;
        else if (isNetworkFailure(uploadError)) {
          throw new Error('The video connection kept dropping, even with resumable retries. The video was not saved; try Wi-Fi or a steadier connection, then upload it again.');
        }
      }
    } else {
      onStage('uploading');
      ({ error: uploadError } = await attemptUpload());
      if (uploadError && isNetworkFailure(uploadError)) {
        if (await verifyStoredFile()) uploadError = null;
        else {
          onStage('retrying');
          ({ error: uploadError } = await attemptUpload());
          if (uploadError && (isNetworkFailure(uploadError) || isDuplicateError(uploadError))) {
            if (await verifyStoredFile()) uploadError = null;
            else throw uncertainNetworkError('retrying the file upload');
          }
        }
      }
    }
    if (uploadError) throw uploadError;

    const row = {
      title: metadata.title.trim() || file.name.replace(/\.[^.]+$/, ''),
      media_type: metadata.mediaType,
      memory_date: metadata.memoryDate || null,
      caption: metadata.caption.trim(),
      storage_path: storagePath,
      original_name: file.name,
      content_type: contentType,
      file_size: file.size,
      created_by: session.user.id,
    };

    const insertRow = async () => {
      try { return await supabaseClient.from('memories').insert(row).select('id').single(); }
      catch (error) { return { data: null, error }; }
    };
    const findSavedRow = async () => {
      onStage('checking-row');
      let existing;
      let lookupError;
      try {
        ({ data: existing, error: lookupError } = await supabaseClient
          .from('memories').select('id').eq('storage_path', storagePath).maybeSingle());
      } catch (error) { lookupError = error; }
      if (lookupError && isNetworkFailure(lookupError)) throw uncertainNetworkError('checking whether the memory was saved');
      if (lookupError) throw lookupError;
      return existing;
    };

    onStage('saving');
    let result = await insertRow();
    if (result.error && (isNetworkFailure(result.error) || isDuplicateError(result.error))) {
      let existing = await findSavedRow();
      if (!existing && isNetworkFailure(result.error)) {
        onStage('retrying-row');
        result = await insertRow();
        if (result.error && (isNetworkFailure(result.error) || isDuplicateError(result.error))) existing = await findSavedRow();
      }
      if (existing) return existing;
      if (result.error && (isNetworkFailure(result.error) || isDuplicateError(result.error))) throw uncertainNetworkError('saving the memory details');
    }
    if (result.error) {
      await storage.remove([storagePath]);
      throw result.error;
    }
    return result.data;
  };

  window.DiaryClient = {
    configured,
    maxFileSize: MAX_FILE_SIZE,
    client,
    getMemberSession,
    signInWithEmail,
    signOut: async () => {
      const supabaseClient = requireConfigured();
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
    },
    listMemories,
    uploadMemory,
  };
})();
