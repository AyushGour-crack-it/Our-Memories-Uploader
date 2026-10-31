(() => {
  const form = document.querySelector('#memory-upload-form');
  const authForm = document.querySelector('#diary-auth-form');
  const authEmail = document.querySelector('#diary-email');
  const authStatus = document.querySelector('#diary-auth-status');
  const status = document.querySelector('#upload-status');
  const selection = document.querySelector('#upload-selection');
  const fileInput = document.querySelector('#memory-files');
  const dropZone = document.querySelector('#upload-drop');
  const dropHint = document.querySelector('#upload-drop-hint');
  const mixedModeButton = document.querySelector('#mixed-upload');
  const signOut = document.querySelector('#diary-signout');
  const diaryLinks = [document.querySelector('#back-to-diary-top'), document.querySelector('#back-to-diary')].filter(Boolean);
  const kinds = [...document.querySelectorAll('.upload-category')];
  const dateField = form.querySelector('[name="memory-date"]');
  const titleField = form.querySelector('[name="memory-title"]');
  const noteField = form.querySelector('[name="memory-note"]');
  const locationField = form.querySelector('[name="memory-location"]');
  let selectedKind = 'photo';
  let session = null;
  let sharedFiles = [];
  const say = (node, message, error = false) => { node.textContent = message; node.classList.toggle('is-error', error); node.classList.add('is-visible'); };
  const types = { photo: 'image/*', video: 'video/*', voice: 'audio/*', other: '', mixed: 'image/*,video/*,audio/*' };
  const mediaKind = (file) => {
    const type = file.type.toLowerCase();
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif'].includes(ext)) return 'photo';
    if (type.startsWith('video/') || ['mp4', 'mov', 'm4v', 'webm', 'mpeg', 'mpg', '3gp'].includes(ext)) return 'video';
    if (type.startsWith('audio/') || ['m4a', 'mp3', 'wav', 'ogg', 'oga', 'opus', 'aac', 'flac', 'amr'].includes(ext)) return 'voice';
    return null;
  };
  const renderSelection = () => {
    const files = [...fileInput.files]; selection.replaceChildren();
    if (dropHint) dropHint.textContent = selectedKind === 'other'
      ? 'Optional for little things · attach a file or leave it empty to write an envelope note.'
      : selectedKind === 'mixed'
        ? 'Choose several photos, videos, and voice notes together · 50 MB max each'
      : 'or drag your files here · multiple files welcome · 50 MB max each';
    if (!files.length) {
      selection.textContent = selectedKind === 'other'
        ? 'No file needed for a little note. Add a title, date, and message to make an envelope.'
        : 'No files picked yet.';
      return;
    }
    const shelfName = selectedKind === 'voice' ? 'voice note' : selectedKind === 'other' ? 'little thing' : selectedKind === 'mixed' ? 'mixed memory batch' : selectedKind;
    const summary = document.createElement('span'); summary.textContent = `${files.length} ${files.length === 1 ? 'file' : 'files'} selected for the ${shelfName} shelf · up to 50 MB each:`;
    const list = document.createElement('ul');
    files.forEach((file) => { const item = document.createElement('li'); item.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`; list.append(item); });
    selection.append(summary, list);
  };
  const validate = (file) => {
    if (file.size > window.DiaryClient.maxFileSize) throw new Error(`${file.name} is over the 50 MB per-file limit. Choose a smaller copy; it has not been uploaded.`);
    const fileKind = mediaKind(file);
    if (selectedKind === 'photo' && fileKind !== 'photo') throw new Error(`${file.name} is not an image. Choose a photo or select its matching memory type.`);
    if (selectedKind === 'video' && fileKind !== 'video') throw new Error(`${file.name} is not a video. Choose a video or select its matching memory type.`);
    if (selectedKind === 'voice' && fileKind !== 'voice') throw new Error(`${file.name} is not an audio file. Choose a voice note or select its matching memory type.`);
    if (selectedKind === 'mixed' && !fileKind) throw new Error(`${file.name} is not a photo, video, or audio file supported by shared uploads.`);
    const allowed = Boolean(fileKind) || file.type === 'application/pdf' || file.type === 'text/plain';
    if (!allowed) throw new Error(`${file.name} is not a supported keepsake. Photos, videos, audio, PDFs, and text files are supported.`);
  };
  const loadSharedFiles = async () => {
    const shared = await window.DiaryPwa?.readSharedFiles?.() || [];
    if (!shared.length) {
      if (shareState === 'ready') say(status, 'The shared items were not available to review. Choose them again from your gallery or files.');
      return;
    }
    sharedFiles = shared;
    selectedKind = 'mixed'; fileInput.accept = types.mixed; mixedModeButton.setAttribute('aria-pressed', 'true');
    kinds.forEach((button) => { button.classList.remove('is-selected'); button.setAttribute('aria-pressed', 'false'); });
    const transfer = new DataTransfer(); shared.forEach((file) => transfer.items.add(file)); fileInput.files = transfer.files;
    renderSelection();
    say(status, `${shared.length} ${shared.length === 1 ? 'item' : 'items'} received from Share. Review the title, note, date, and optional place before saving.`);
    history.replaceState({}, '', `${location.pathname}${location.hash}`);
  };
  const syncSession = async () => {
    if (!window.DiaryClient.configured) { authForm.hidden = false; return; }
    try {
      session = await window.DiaryClient.getMemberSession();
      if (session) { authForm.hidden = true; form.hidden = false; signOut.hidden = false; await loadSharedFiles(); }
      else {
        authForm.hidden = false; form.hidden = true; signOut.hidden = true;
        const pending = await window.DiaryPwa?.readSharedFiles?.() || [];
        if (pending.length) say(authStatus, 'Sign in to finish adding the shared files. They are held temporarily on this device for up to 24 hours.');
      }
    } catch (error) { authForm.hidden = false; say(authStatus, error.message || 'This account cannot access the diary.', true); }
  };
  const shareState = new URLSearchParams(location.search).get('shared');
  const shareMessages = {
    empty: 'No photo, video, or voice note came through. Choose it from the uploader instead.',
    large: 'A shared file is over the 50 MB limit. Choose a smaller copy, then share it again.',
    unsupported: 'That file type cannot be shared here. Photos, videos, and audio notes are supported.',
    failed: 'The shared files could not be prepared on this device. Open the uploader and choose them there.',
  };
  if (shareMessages[shareState]) {
    const message = shareMessages[shareState];
    say(authStatus, message, shareState !== 'empty');
    say(status, message, shareState !== 'empty');
  }
  kinds.forEach((button) => button.addEventListener('click', () => {
    selectedKind = button.dataset.kind;
    mixedModeButton.setAttribute('aria-pressed', 'false');
    kinds.forEach((choice) => { const selected = choice === button; choice.classList.toggle('is-selected', selected); choice.setAttribute('aria-pressed', String(selected)); });
    fileInput.accept = types[selectedKind]; fileInput.value = ''; sharedFiles = []; window.DiaryPwa?.clearSharedFiles?.().catch(() => {}); renderSelection();
  }));
  mixedModeButton.addEventListener('click', () => {
    selectedKind = 'mixed'; fileInput.accept = types.mixed; fileInput.value = ''; sharedFiles = [];
    mixedModeButton.setAttribute('aria-pressed', 'true');
    kinds.forEach((button) => { button.classList.remove('is-selected'); button.setAttribute('aria-pressed', 'false'); });
    window.DiaryPwa?.clearSharedFiles?.().catch(() => {}); renderSelection();
  });
  fileInput.addEventListener('change', () => { sharedFiles = []; window.DiaryPwa?.clearSharedFiles?.().catch(() => {}); renderSelection(); });
  ['dragenter', 'dragover'].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.add('is-dragging'); }));
  ['dragleave', 'drop'].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.remove('is-dragging'); }));
  dropZone.addEventListener('drop', (event) => {
    const files = [...(event.dataTransfer?.files || [])]; if (!files.length) return;
    const transfer = new DataTransfer(); files.forEach((file) => transfer.items.add(file)); fileInput.files = transfer.files; renderSelection();
  });
  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!window.DiaryClient.configured) return say(authStatus, 'Connect Supabase using backend/SETUP.md before signing in.', true);
    try { await window.DiaryClient.signInWithEmail(authEmail.value, '/'); say(authStatus, 'Check your inbox for the private sign-in link. Open it in this browser.'); }
    catch (error) { say(authStatus, error.message || 'Could not send the sign-in link.', true); }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let files = [...fileInput.files];
    if (!files.length && selectedKind === 'other') {
      if (!titleField.value.trim() || !dateField.value || !noteField.value.trim()) {
        return say(status, 'A little letter needs a title, a date, and the message you want to keep.', true);
      }
      files = [new File([noteField.value.trim()], 'little-letter.txt', { type: 'text/plain' })];
    }
    if (!files.length) return say(status, 'Choose a file first, or choose “little thing” to write a note-only envelope.', true);
    if (!session) return say(status, 'Please sign in with an invited account first.', true);
    try { files.forEach(validate); } catch (error) { return say(status, error.message, true); }
    const saveButton = form.querySelector('.upload-save'); saveButton.disabled = true;
    let saved = 0;
    try {
      for (const [index, file] of files.entries()) {
        const title = titleField.value.trim() || file.name.replace(/\.[^.]+$/, '');
        const itemTitle = files.length > 1 && titleField.value.trim() ? `${title} · ${index + 1}` : title;
        await window.DiaryClient.uploadMemory(file, {
          title: itemTitle,
          mediaType: selectedKind === 'other' ? 'little-things' : selectedKind === 'mixed' ? mediaKind(file) : selectedKind,
          memoryDate: dateField.value,
          caption: noteField.value,
          location: locationField.value.trim(),
        }, session, (stage, detail) => {
          const stageNames = {
            'checking-duplicate': 'Checking whether this voice note is already saved',
            uploading: 'Uploading',
            checking: 'Checking whether the file arrived',
            retrying: 'Connection hiccup · retrying the file',
            resumable: 'Preparing a resumable video upload',
            saving: 'Saving memory details for',
            'checking-row': 'Checking whether the memory was saved',
            'retrying-row': 'Connection hiccup · retrying memory details for',
          };
          if (stage === 'upload-progress') {
            say(status, `Uploading ${detail}% · ${index + 1} of ${files.length}: ${file.name}`);
            return;
          }
          say(status, `${stageNames[stage] || 'Saving'} ${index + 1} of ${files.length}: ${file.name}`);
        });
        const matchingSharedFile = sharedFiles.find((shared) => shared.name === file.name && shared.size === file.size && shared.lastModified === file.lastModified);
        if (matchingSharedFile) {
          await window.DiaryPwa.removeSharedFile(matchingSharedFile);
          sharedFiles = sharedFiles.filter((shared) => shared !== matchingSharedFile);
        }
        saved += 1;
      }
      if (saved && selectedKind === 'mixed') { fileInput.value = ''; fileInput.files = new DataTransfer().files; sharedFiles = []; renderSelection(); }
      say(status, `${saved} ${saved === 1 ? 'memory is' : 'memories are'} safely in the diary. The main diary may ask you to sign in there separately.`);
    } catch (error) {
      if (saved && sharedFiles.length) {
        const remaining = files.slice(saved); const transfer = new DataTransfer(); remaining.forEach((file) => transfer.items.add(file)); fileInput.files = transfer.files; renderSelection();
      }
      say(status, `${saved ? `${saved} saved. ` : ''}${error.message || 'The upload could not be completed.'}`, true);
    } finally { saveButton.disabled = false; }
  });
  signOut.addEventListener('click', async () => { await window.DiaryClient.signOut(); location.reload(); });
  if (!window.DiaryClient.configured) say(authStatus, 'Add the Supabase project URL and publishable key to diary-config.js to connect private uploads.', true);
  const archiveUrl = window.DIARY_CONFIG?.archiveUrl?.trim();
  if (archiveUrl) diaryLinks.forEach((link) => { link.href = archiveUrl; });
  else diaryLinks.forEach((link) => {
    link.addEventListener('click', (event) => { event.preventDefault(); say(status, 'Add the main diary URL to diary-config.js to connect this return link.'); });
  });
  syncSession().then(() => {
    if (shareState === 'ready' && !session) {
      say(authStatus, 'Sign in to finish adding the shared files. They are held temporarily on this device for up to 24 hours.');
      history.replaceState({}, '', `${location.pathname}${location.hash}`);
    }
  });
  renderSelection();
})();
