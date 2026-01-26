// Temp Mail Quick - Popup Script
// Uses mail.tm free public API with built-in inbox

document.addEventListener('DOMContentLoaded', () => {
  // Elements - Main View
  const mainView = document.getElementById('mainView');
  const emailInput = document.getElementById('emailAddress');
  const copyBtn = document.getElementById('copyBtn');
  const copyIcon = document.getElementById('copyIcon');
  const copyFeedback = document.getElementById('copyFeedback');
  const newEmailBtn = document.getElementById('newEmailBtn');
  const openInboxBtn = document.getElementById('openInboxBtn');

  // Elements - Inbox View
  const inboxView = document.getElementById('inboxView');
  const backBtn = document.getElementById('backBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const inboxEmail = document.getElementById('inboxEmail');
  const messageList = document.getElementById('messageList');
  const emptyInbox = document.getElementById('emptyInbox');

  // Elements - Message View
  const messageView = document.getElementById('messageView');
  const backToInboxBtn = document.getElementById('backToInboxBtn');
  const msgSubject = document.getElementById('msgSubject');
  const msgFrom = document.getElementById('msgFrom');
  const msgDate = document.getElementById('msgDate');
  const msgBody = document.getElementById('msgBody');

  // Browser API compatibility
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  // mail.tm API
  const API_BASE = 'https://api.mail.tm';
  
  // Current account data
  let currentAccount = null;

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================

  function generateUsername(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function generatePassword(length = 12) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  function setLoading(isLoading) {
    if (isLoading) {
      emailInput.value = 'Loading...';
      emailInput.style.opacity = '0.6';
      newEmailBtn.disabled = true;
      openInboxBtn.disabled = true;
    } else {
      emailInput.style.opacity = '1';
      newEmailBtn.disabled = false;
      openInboxBtn.disabled = false;
    }
  }

  // ==========================================
  // VIEW MANAGEMENT
  // ==========================================

  function showMainView() {
    mainView.classList.remove('hidden');
    inboxView.classList.add('hidden');
    messageView.classList.add('hidden');
  }

  function showInboxView() {
    mainView.classList.add('hidden');
    inboxView.classList.remove('hidden');
    messageView.classList.add('hidden');
    inboxEmail.textContent = currentAccount?.email || '';
    loadMessages();
  }

  function showMessageView(message) {
    mainView.classList.add('hidden');
    inboxView.classList.add('hidden');
    messageView.classList.remove('hidden');
    
    msgSubject.textContent = message.subject || '(No Subject)';
    msgFrom.textContent = `From: ${message.from?.address || 'Unknown'}`;
    msgDate.textContent = `Date: ${formatDate(message.createdAt)}`;
    
    // Get full message content
    loadMessageContent(message.id);
  }

  // ==========================================
  // API FUNCTIONS
  // ==========================================

  async function getDomains() {
    try {
      const response = await fetch(`${API_BASE}/domains`);
      const data = await response.json();
      
      if (data['hydra:member'] && data['hydra:member'].length > 0) {
        const activeDomain = data['hydra:member'].find(d => d.isActive);
        return activeDomain ? activeDomain.domain : data['hydra:member'][0].domain;
      }
      throw new Error('No domains available');
    } catch (error) {
      console.error('[TempMail] Error getting domains:', error);
      return null;
    }
  }

  async function createAccount() {
    setLoading(true);
    
    try {
      const domain = await getDomains();
      if (!domain) {
        throw new Error('Could not get domain');
      }

      const username = generateUsername();
      const password = generatePassword();
      const email = `${username}@${domain}`;

      // Create account
      const createResponse = await fetch(`${API_BASE}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: email, password: password })
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.message || `HTTP ${createResponse.status}`);
      }

      const accountData = await createResponse.json();

      // Get auth token
      const tokenResponse = await fetch(`${API_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: email, password: password })
      });

      if (!tokenResponse.ok) {
        throw new Error('Could not get auth token');
      }

      const tokenData = await tokenResponse.json();

      currentAccount = {
        id: accountData.id,
        email: email,
        password: password,
        token: tokenData.token,
        createdAt: Date.now()
      };

      emailInput.value = email;

      await browserAPI.storage.local.set({ tempMailAccount: currentAccount });
      console.log('[TempMail] Created account:', email);
      return currentAccount;

    } catch (error) {
      console.error('[TempMail] Error creating account:', error);
      emailInput.value = 'Error - Try again';
      emailInput.style.color = '#e74c3c';
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function loadAccount() {
    setLoading(true);
    
    try {
      const result = await browserAPI.storage.local.get(['tempMailAccount']);
      const oneHour = 60 * 60 * 1000;
      const now = Date.now();
      
      if (result.tempMailAccount && 
          result.tempMailAccount.createdAt && 
          (now - result.tempMailAccount.createdAt) < oneHour &&
          result.tempMailAccount.token) {
        
        currentAccount = result.tempMailAccount;
        emailInput.value = currentAccount.email;
        setLoading(false);
        console.log('[TempMail] Loaded from storage:', currentAccount.email);
      } else {
        await createAccount();
      }
    } catch (error) {
      console.error('[TempMail] Load error:', error);
      await createAccount();
    }
  }

  async function loadMessages() {
    if (!currentAccount || !currentAccount.token) {
      messageList.innerHTML = '<div class="error">No account - go back and create one</div>';
      return;
    }

    messageList.innerHTML = '<div class="loading">Loading messages...</div>';
    emptyInbox.classList.add('hidden');

    try {
      const response = await fetch(`${API_BASE}/messages`, {
        headers: {
          'Authorization': `Bearer ${currentAccount.token}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, need to re-authenticate
          await refreshToken();
          return loadMessages();
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const messages = data['hydra:member'] || [];

      if (messages.length === 0) {
        messageList.innerHTML = '';
        emptyInbox.classList.remove('hidden');
      } else {
        emptyInbox.classList.add('hidden');
        renderMessages(messages);
      }

    } catch (error) {
      console.error('[TempMail] Error loading messages:', error);
      messageList.innerHTML = '<div class="error">Error loading messages</div>';
    }
  }

  async function refreshToken() {
    if (!currentAccount) return;

    try {
      const tokenResponse = await fetch(`${API_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: currentAccount.email,
          password: currentAccount.password
        })
      });

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        currentAccount.token = tokenData.token;
        await browserAPI.storage.local.set({ tempMailAccount: currentAccount });
      }
    } catch (error) {
      console.error('[TempMail] Error refreshing token:', error);
    }
  }

  function renderMessages(messages) {
    messageList.innerHTML = messages.map(msg => `
      <div class="message-item" data-id="${msg.id}">
        <div class="message-sender">${msg.from?.address || 'Unknown'}</div>
        <div class="message-subject-preview">${msg.subject || '(No Subject)'}</div>
        <div class="message-time">${formatDate(msg.createdAt)}</div>
      </div>
    `).join('');

    // Add click handlers
    messageList.querySelectorAll('.message-item').forEach(item => {
      item.addEventListener('click', () => {
        const msgId = item.dataset.id;
        const msg = messages.find(m => m.id === msgId);
        if (msg) showMessageView(msg);
      });
    });
  }

  async function loadMessageContent(messageId) {
    msgBody.innerHTML = '<div class="loading">Loading...</div>';

    try {
      const response = await fetch(`${API_BASE}/messages/${messageId}`, {
        headers: {
          'Authorization': `Bearer ${currentAccount.token}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const message = await response.json();
      
      // Prefer HTML content, fall back to text
      if (message.html && message.html.length > 0) {
        // Sanitize and display HTML
        msgBody.innerHTML = `<div class="html-content">${message.html.join('')}</div>`;
      } else if (message.text) {
        msgBody.innerHTML = `<pre class="text-content">${escapeHtml(message.text)}</pre>`;
      } else {
        msgBody.innerHTML = '<div class="no-content">No content</div>';
      }

    } catch (error) {
      console.error('[TempMail] Error loading message:', error);
      msgBody.innerHTML = '<div class="error">Error loading message</div>';
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==========================================
  // CLIPBOARD
  // ==========================================

  async function copyEmail() {
    const email = emailInput.value;
    if (!email || email === 'Loading...' || email.startsWith('Error')) return;

    try {
      await navigator.clipboard.writeText(email);
      copyIcon.textContent = '✅';
      copyFeedback.classList.remove('hidden');
      
      setTimeout(() => {
        copyIcon.textContent = '📋';
        copyFeedback.classList.add('hidden');
      }, 2000);
    } catch (error) {
      emailInput.select();
      document.execCommand('copy');
      copyIcon.textContent = '✅';
      setTimeout(() => { copyIcon.textContent = '📋'; }, 2000);
    }
  }

  // ==========================================
  // EVENT LISTENERS
  // ==========================================

  copyBtn.addEventListener('click', copyEmail);
  
  newEmailBtn.addEventListener('click', async () => {
    emailInput.style.color = '';
    newEmailBtn.innerHTML = '⏳ Creating...';
    await createAccount();
    newEmailBtn.innerHTML = '🔄 New Email';
  });
  
  openInboxBtn.addEventListener('click', showInboxView);
  backBtn.addEventListener('click', showMainView);
  refreshBtn.addEventListener('click', loadMessages);
  backToInboxBtn.addEventListener('click', showInboxView);

  emailInput.addEventListener('dblclick', () => emailInput.select());

  // ==========================================
  // INITIALIZE
  // ==========================================

  loadAccount();
});
