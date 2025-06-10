document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const messageEl = document.getElementById('login-message');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            messageEl.textContent = ''; // Limpa mensagens anteriores

            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value.trim();

            if (!email || !password) {
                messageEl.textContent = 'Por favor, preencha email e senha.';
                messageEl.style.color = '#e63946';
                return;
            }

            try {
                // Usa API_URL e SITE_API_KEY definidos em config.js (incluído no HTML)
                const response = await fetch(`${API_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-organization-key': SITE_API_KEY // Chave do site/tenant
                    },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    messageEl.textContent = data.message || 'Erro ao fazer login.';
                    messageEl.style.color = '#e63946';
                } else {
                    // Login bem-sucedido
                    messageEl.textContent = 'Login bem-sucedido! Redirecionando...';
                    messageEl.style.color = '#28a745';

                    // Armazena token e dados do usuário para usar no dashboard
                    sessionStorage.setItem('token', data.token);
                    sessionStorage.setItem('apiKey', data.apiKey); // API Key do *usuário do painel*
                    sessionStorage.setItem('username', data.name); // Nome do usuário

                    // Redireciona para o dashboard após um pequeno atraso
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1000);
                }
            } catch (error) {
                console.error('Erro no fetch de login:', error);
                messageEl.textContent = 'Erro de conexão ao tentar fazer login.';
                messageEl.style.color = '#e63946';
            }
        });
    }
});