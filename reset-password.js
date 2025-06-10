document.addEventListener('DOMContentLoaded', () => {
    const requestForm = document.getElementById('forgotPasswordRequestForm');
    const resetForm = document.getElementById('forgotPasswordResetForm');
    const requestMessageEl = document.getElementById('forgot-password-request-message');
    const resetMessageEl = document.getElementById('forgot-password-reset-message');

    // Extrai token e email da URL (se presentes)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const email = urlParams.get('email');

    // Decide qual formulário mostrar
    if (token && email) {
        // Se token e email estão na URL, mostra o formulário de definir nova senha
        if(requestForm) requestForm.style.display = 'none';
        if(resetForm) resetForm.style.display = 'block';
    } else {
        // Caso contrário, mostra o formulário de solicitar reset
        if(requestForm) requestForm.style.display = 'block';
        if(resetForm) resetForm.style.display = 'none';
    }

    // Listener para solicitar o email de reset
    if (requestForm) {
        requestForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            requestMessageEl.textContent = ''; // Limpa mensagens

            const requestEmail = document.getElementById('forgot-password-request-email').value.trim();
            if (!requestEmail) {
                requestMessageEl.textContent = 'Por favor, digite seu email.';
                requestMessageEl.style.color = '#e63946';
                return;
            }

            requestMessageEl.textContent = 'Enviando solicitação...';
            requestMessageEl.style.color = '#007bff';

            try {
                // Usa API_URL e SITE_API_KEY de config.js
                const response = await fetch(`${API_URL}/api/auth/forgot-password-request`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-organization-key': SITE_API_KEY
                    },
                    body: JSON.stringify({ email: requestEmail })
                });

                const data = await response.json();

                if (!response.ok) {
                    requestMessageEl.textContent = data.message || 'Erro ao solicitar redefinição.';
                    requestMessageEl.style.color = '#e63946';
                } else {
                    requestMessageEl.textContent = 'Email de redefinição enviado com sucesso! Verifique sua caixa de entrada (e spam).';
                    if (data.previewURL) { // Se Ethereal foi usado, mostra o link de preview
                        requestMessageEl.innerHTML += `<br><a href="${data.previewURL}" target="_blank">Ver email de teste (Ethereal)</a>`;
                    }
                    requestMessageEl.style.color = '#28a745';
                }
            } catch (error) {
                console.error('Erro no fetch de forgot-password-request:', error);
                requestMessageEl.textContent = 'Erro de conexão ao solicitar redefinição.';
                requestMessageEl.style.color = '#e63946';
            }
        });
    }

    // Listener para redefinir a senha (quando token e email estão na URL)
    if (resetForm && token && email) {
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            resetMessageEl.textContent = ''; // Limpa mensagens

            const newPassword = document.getElementById('forgot-password-reset-new-password').value;
            const confirmPassword = document.getElementById('forgot-password-reset-confirm-password').value;

            if (!newPassword || !confirmPassword) {
                resetMessageEl.textContent = 'Por favor, preencha e confirme a nova senha.';
                resetMessageEl.style.color = '#e63946';
                return;
            }

            if (newPassword !== confirmPassword) {
                resetMessageEl.textContent = 'As senhas não conferem.';
                resetMessageEl.style.color = '#e63946';
                return;
            }

             // Validação de complexidade (igual à do backend)
            if (newPassword.length < 8 || !/\d/.test(newPassword) || !/[a-zA-Z]/.test(newPassword)) {
              resetMessageEl.textContent = 'A nova senha deve ter no mínimo 8 caracteres, incluindo letras e números.';
              resetMessageEl.style.color = '#e63946';
              return;
            }

            resetMessageEl.textContent = 'Redefinindo senha...';
            resetMessageEl.style.color = '#007bff';

            try {
                 // Usa API_URL e SITE_API_KEY de config.js
                const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-organization-key': SITE_API_KEY
                    },
                    // Envia email, token (da URL) e a nova senha
                    body: JSON.stringify({ email: decodeURIComponent(email), token, newPassword })
                });

                const data = await response.json();

                if (!response.ok) {
                    resetMessageEl.textContent = data.message || 'Erro ao redefinir senha (token inválido/expirado?).';
                    resetMessageEl.style.color = '#e63946';
                } else {
                    resetMessageEl.textContent = 'Senha redefinida com sucesso! Redirecionando para login...';
                    resetMessageEl.style.color = '#28a745';

                    // Limpa token da URL e redireciona para login
                    setTimeout(() => {
                         window.location.href = 'login.html'; // Redireciona para a página de login
                    }, 2000);
                }
            } catch (error) {
                console.error('Erro no fetch de forgot-password:', error);
                resetMessageEl.textContent = 'Erro de conexão ao redefinir senha.';
                resetMessageEl.style.color = '#e63946';
            }
        });
    }
});
