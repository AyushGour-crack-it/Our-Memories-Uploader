(() => {
  const form = document.querySelector('#memory-upload-form');
  const authForm = document.querySelector('#diary-auth-form');
  const authEmail = document.querySelector('#diary-email');
  const authStatus = document.querySelector('#diary-auth-status');
  const status = document.querySelector('#upload-status');
  const selection = document.querySelector('#upload-selection');
  const fileInput = document.querySelector('#memory-files');
  const dropZone = document.querySelector('#upload-drop');
  const signOut = document.querySelector('#diary-signout');
  const diaryLinks = [document.querySelector('#back-to-diary-top'), document.querySelector('#back-to-diary')].filter(Boolean);
  const kinds = [...document.querySelectorAll('.upload-category')];
  const dateField = form.querySelector('[name="memory-date"]');
  const titleField = form.querySelector('[name="memory-title"]');
  const noteField = form.querySelector('[name="memory-note"]');
  let selectedKind = 'photo';
  let session = null;
  const say = (node, message, error = false) => { node.textContent = message; node.classList.toggle('is-error', error); node.classList.add('is-visible'); };
  const types = { photo: 'image/*', video: 'video/*', voice: 'audio/*', other: '' };
  const renderSelection = () => {
    const files = [...fileInput.files]; selection.replaceChildren();
    if (!files.length) { selection.textContent = 'No files picked yet.'; return; }
    const shelfName = selectedKind === 'voice' ? 'voice note' : selectedKind === 'other' ? 'little thing' : selectedKind;
    const summary = document.createElement('span'); summary.textContent = `${files.length} ${files.length === 1 ? 'file' : 'files'} selected for the ${shelfName} shelf · up to 50 MB each:`;
    const list = document.createElement('ul');
    files.forEach((file) => { const item = document.createElement('li'); item.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`; list.append(item); });
    selection.append(summary, list);
  };
  const validate = (file) => {
    if (file.size > window.DiaryClient.maxFileSize) throw new Error(`${file.name} is over the 50 MB per-file limit. Choose a smaller copy; it has not been uploaded.`);
    if (selectedKind === 'photo' && !file.type.startsWith('image/')) throw new Error(`${file.name} is not an image. Choose a photo or select its matching memory type.`);
    if (selectedKind === 'video' && !file.type.startsWith('video/')) throw new Error(`${file.name} is not a video. Choose a video or select its matching memory type.`);
    if (selectedKind === 'voice' && !file.type.startsWith('audio/')) throw new Error(`${file.name} is not an audio file. Choose a voice note or select its matching memory type.`);
    const allowed = file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/') || file.type === 'application/pdf' || file.type === 'text/plain';
    if (!allowed) throw new Error(`${file.name} is not a supported keepsake. Photos, videos, audio, PDFs, and text files are supported.`);
  };
  const syncSession = async () => {
    if (!window.DiaryClient.configured) { authForm.hidden = false; return; }
    try {
      session = await window.DiaryClient.getMemberSession();
      if (session) { authForm.hidden = true; form.hidden = false; signOut.hidden = false; }
      else { authForm.hidden = false; form.hidden = true; signOut.hidden = true; }
    } catch (error) { authForm.hidden = false; say(authStatus, error.message || 'This account cannot access the diary.', true); }
  };
  kinds.forEach((button) => button.addEventListener('click', () => {
    selectedKind = button.dataset.kind;
    kinds.forEach((choice) => { const selected = choice === button; choice.classList.toggle('is-selected', selected); choice.setAttribute('aria-pressed', String(selected)); });
    fileInput.accept = types[selectedKind]; fileInput.value = ''; renderSelection();
  }));
  fileInput.addEventListener('change', renderSelection);
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
    const files = [...fileInput.files];
    if (!files.length) return say(status, 'Choose at least one little memory first.', true);
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
          mediaType: selectedKind === 'other' ? 'little-things' : selectedKind,
          memoryDate: dateField.value,
          caption: noteField.value,
        }, session, (stage) => {
          const stageNames = {
            uploading: 'Uploading',
            checking: 'Checking whether the file arrived',
            retrying: 'Connection hiccup · retrying the file',
            saving: 'Saving memory details for',
            'checking-row': 'Checking whether the memory was saved',
            'retrying-row': 'Connection hiccup · retrying memory details for',
          };
          say(status, `${stageNames[stage] || 'Saving'} ${index + 1} of ${files.length}: ${file.name}`);
        });
        saved += 1;
      }
      say(status, `${saved} ${saved === 1 ? 'memory is' : 'memories are'} safely in the diary. The main diary may ask you to sign in there separately.`);
    } catch (error) {
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
  syncSession(); renderSelection();
})();
