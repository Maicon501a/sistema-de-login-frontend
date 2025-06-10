document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const messageEl = document.getElementById('register-message');

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            messageEl.textContent = ''; // Limpa mensagens anteriores

            const name = document.getElementById('register-name').value.trim();
            const email = document.getElementById('register-email').value.trim();
            const password = document.getElementById('register-password').value;
            const confirmPassword = document.getElementById('register-confirm-password').value;

            if (!name || !email || !password || !confirmPassword) {
                messageEl.textContent = 'Por favor, preencha todos os campos.';
                messageEl.style.color = '#e63946';
                return;
            }

            if (password !== confirmPassword) {
                messageEl.textContent = 'As senhas não conferem.';
                messageEl.style.color = '#e63946';
                return;
            }

            // Validação de complexidade (igual à do backend)
            if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
              messageEl.textContent = 'A senha deve ter no mínimo 8 caracteres, incluindo letras e números.';
              messageEl.style.color = '#e63946';
              return;
            }


            try {
                // Usa API_URL e SITE_API_KEY definidos em config.js
                const response = await fetch(`${API_URL}/api/auth/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-organization-key': SITE_API_KEY
                    },
                    body: JSON.stringify({ name, email, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    messageEl.textContent = data.message || 'Erro ao registrar.';
                    messageEl.style.color = '#e63946';
                } else {
                    // Registro e Login Automático bem-sucedidos
                    messageEl.textContent = 'Registro bem-sucedido! Logando...';
                    messageEl.style.color = '#28a745';

                    // Salva o token e nome de usuário no sessionStorage (igual ao login.js)
                    sessionStorage.setItem('token', data.token);
                    sessionStorage.setItem('apiKey', data.apiKey); // API Key do usuário do painel
                    sessionStorage.setItem('username', data.name); // Nome do usuário

                    // Redireciona para o dashboard imediatamente
                    window.location.href = 'dashboard.html';
                    // Não precisa mais do setTimeout
                }
            } catch (error) {
                console.error('Erro no fetch de registro:', error);
                messageEl.textContent = 'Erro de conexão ao tentar registrar.';
                messageEl.style.color = '#e63946';
            }
        });
    }
});