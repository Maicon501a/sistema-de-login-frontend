document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('registerForm');
  const registerResult = document.getElementById('registerResult');
  const loginForm = document.getElementById('loginForm');
  const loginResult = document.getElementById('loginResult');
  const authSection = document.getElementById('authSection');
  const userPanel = document.getElementById('userPanel');
  const usernameDisplay = document.getElementById('usernameDisplay');
  const orgKeyDisplay = document.getElementById('orgKeyDisplay');
  const userKeyDisplay = document.getElementById('userKeyDisplay');
  const logoutBtn = document.getElementById('logoutBtn');

  const SITE_KEY = window.SITE_API_KEY;
  const API_URL = window.API_URL;

  function showPanel(username, apiKey) {
    authSection.style.display = 'none';
    userPanel.style.display = 'block';
    usernameDisplay.textContent = username;
    orgKeyDisplay.textContent = SITE_KEY;
    userKeyDisplay.textContent = apiKey;
  }

  function showAuth() {
    authSection.style.display = 'block';
    userPanel.style.display = 'none';
    registerResult.textContent = '';
    loginResult.textContent = '';
  }

  // Sempre exibe auth ao carregar (sem localStorage)
  showAuth();

  registerForm.addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    registerResult.style.color = '#000';
    registerResult.textContent = 'Registrando...';
    try {
      const resp = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-key': SITE_KEY
        },
        body: JSON.stringify({ username, password })
      });
      const data = await resp.json();
      if (resp.ok) {
        registerResult.style.color = '#28a745';
        registerResult.textContent = `Registrado! Sua API Key: ${data.apiKey}`;
        showPanel(username, data.apiKey);
      } else {
        registerResult.style.color = '#dc3545';
        registerResult.textContent = data.message || 'Erro ao registrar';
      }
    } catch (err) {
      registerResult.style.color = '#dc3545';
      registerResult.textContent = err.message;
    }
  });

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    loginResult.style.color = '#000';
    loginResult.textContent = 'Entrando...';
    try {
      const resp = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-key': SITE_KEY
        },
        body: JSON.stringify({ username, password })
      });
      const data = await resp.json();
      if (resp.ok) {
        loginResult.style.color = '#28a745';
        loginResult.textContent = 'Autenticado!';
        const apiKey = data.apiKey;
        showPanel(username, apiKey);
      } else {
        loginResult.style.color = '#dc3545';
        loginResult.textContent = data.message || 'Erro ao logar';
      }
    } catch (err) {
      loginResult.style.color = '#dc3545';
      loginResult.textContent = err.message;
    }
  });

  logoutBtn.addEventListener('click', () => {
    showAuth();
  });
});
