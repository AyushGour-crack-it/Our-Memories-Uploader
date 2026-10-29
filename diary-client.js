(() => {
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const BUCKET = 'diary-media';
  const config = window.DIARY_CONFIG || {};
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
    onStage('uploading');
    const { error: uploadError } = await supabaseClient.storage.from(BUCKET).upload(storagePath, file, {
      cacheControl: '3600',
      contentType,
      upsert: false,
    });
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

    onStage('saving');
    const { data, error: rowError } = await supabaseClient
      .from('memories')
      .insert(row)
      .select('id')
      .single();

    if (rowError) {
      await supabaseClient.storage.from(BUCKET).remove([storagePath]);
      throw rowError;
    }
    return data;
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
