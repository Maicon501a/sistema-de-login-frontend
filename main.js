const API_URL = window.API_URL;
// const SITE_API_KEY = window.SITE_API_KEY; // Removido - Não é mais necessário

// Variável global para controlar se uma tentativa de refresh já está em andamento
let isRefreshingToken = false;
let pendingRequests = []; // Fila para requisições pendentes durante o refresh

// Função wrapper para fetch que lida com autenticação e refresh de token
async function fetchWithAuth(url, options = {}, isRetry = false) {
  let token = sessionStorage.getItem('token');

  // Adiciona o token de autorização aos headers
  const headers = {
    ...options.headers,
  };
  if (token) { // Adiciona token apenas se existir
      headers['Authorization'] = `Bearer ${token}`;
  }

  // Se o corpo for um objeto, stringifica e define Content-Type
  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
      body = JSON.stringify(body);
      if (!headers['Content-Type']) { // Define Content-Type apenas se não estiver definido
        headers['Content-Type'] = 'application/json';
      }
  }

  const fetchOptions = { ...options, headers, body };

  try {
    const response = await fetch(url, fetchOptions);

    if (response.status === 401 && !isRetry && url !== `${API_URL}/api/auth/refresh`) { // Não tenta refresh no próprio refresh
      if (!isRefreshingToken) {
        isRefreshingToken = true;
        console.log('Token expirado ou inválido. Tentando renovar...');
        try {
          const refreshResponse = await fetch(`${API_URL}/api/auth/refresh`, { // Não usa fetchWithAuth aqui para evitar loop
            method: 'POST',
            // Cookies são enviados automaticamente
          });

          if (refreshResponse.ok) {
            const data = await refreshResponse.json();
            sessionStorage.setItem('token', data.token); // Armazena o novo token
            console.log('Token renovado com sucesso.');
            isRefreshingToken = false;
            // Reenviar todas as requisições pendentes com o novo token
            const promises = pendingRequests.map(p => p.resolve(fetchWithAuth(p.url, p.options, true)));
            pendingRequests = [];
            await Promise.all(promises); // Espera todas as requisições pendentes
            // Reenviar a requisição original
            return fetchWithAuth(url, options, true);
          } else {
            console.error('Falha ao renovar token. Status:', refreshResponse.status);
            isRefreshingToken = false;
            const error = new Error('Falha ao renovar token.');
            pendingRequests.forEach(p => p.reject(error));
            pendingRequests = [];
            handleLogout(); // Desloga o usuário se o refresh falhar
            return Promise.reject(error); // Rejeita a promessa original
          }
        } catch (refreshError) {
          console.error('Erro durante a tentativa de refresh do token:', refreshError);
          isRefreshingToken = false;
          pendingRequests.forEach(p => p.reject(refreshError));
          pendingRequests = [];
          handleLogout();
          return Promise.reject(refreshError);
        }
      } else {
        // Se já existe um refresh em andamento, adiciona a requisição à fila
        return new Promise((resolve, reject) => {
          pendingRequests.push({ url, options, resolve, reject });
        });
      }
    }
    // Se não for 401 ou se for uma tentativa de retry, retorna a resposta como está
    return response;
  } catch (error) {
    console.error('Erro na função fetchWithAuth:', error);
    // Se o erro for de rede e houver um refresh em andamento, não deslogar imediatamente
    if (!isRefreshingToken) {
       // handleLogout(); // Considerar se o logout é apropriado para todos os erros de fetch
    }
    throw error; // Re-lança o erro para ser tratado pela chamada original
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  const token = sessionStorage.getItem('token');
  if (token) {
    await initDashboard();
  } else {
    window.location.href = 'login.html';
  }
}

async function showSection(id) {
  const sectionToShow = document.getElementById(id);
  if (!sectionToShow) {
      console.error(`Seção com ID "${id}" não encontrada.`);
      const dashboardFallback = document.getElementById('dashboard-section');
      if(dashboardFallback) dashboardFallback.classList.add('active');
      updateSidebarLink(id);
      return;
  }

  if (id === 'documentation-section' && !sectionToShow.dataset.loaded) {
      sectionToShow.innerHTML = '<p>Carregando documentação...</p>';
      try {
          // Nota: fetch('documentation.html') não precisa de autenticação e não usa fetchWithAuth
          const response = await fetch('documentation.html');
          if (!response.ok) {
              throw new Error(`Erro ao buscar documentação: ${response.statusText}`);
          }
          const htmlContent = await response.text();
          sectionToShow.innerHTML = htmlContent;
          sectionToShow.dataset.loaded = 'true';
          setupCopyButtons();

      } catch (error) {
          console.error('Falha ao carregar documentação:', error);
          sectionToShow.innerHTML = `<p style="color: red;">Erro ao carregar a documentação: ${error.message}</p>`;
          updateSidebarLink(id);
          return;
      }
  } else if (id === 'documentation-section') {
      setupCopyButtons();
  }

  document.querySelectorAll('.main-content .section').forEach(s => {
      if (s.id !== id) {
          s.classList.remove('active');
          s.style.display = 'none';
      }
  });

  sectionToShow.scrollIntoView({ behavior: 'smooth', block: 'start' });

  setTimeout(() => {
      sectionToShow.style.display = 'block';
      void sectionToShow.offsetWidth;
      sectionToShow.classList.add('active');
  }, 150);

  updateSidebarLink(id);
}

function updateSidebarLink(activeSectionId) {
    document.querySelectorAll('.sidebar ul li a').forEach(a => a.classList.remove('active'));
    const linkId = `link-${activeSectionId.replace('-section', '')}`;
    const activeLink = document.getElementById(linkId);
    if (activeLink) {
        activeLink.classList.add('active');
    } else {
        document.getElementById('link-dashboard')?.classList.add('active');
    }
}

async function initDashboard() {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const dashboardSection = document.getElementById('dashboard-section');
  if (dashboardSection) dashboardSection.classList.add('active');
  else console.error("Seção #dashboard-section não encontrada!");

  const sidebar = document.querySelector('.sidebar');
  const header = document.querySelector('.header');
  if(sidebar) sidebar.style.display = 'block';
  if(header) header.style.display = 'flex';

  // const token = sessionStorage.getItem('token'); // fetchWithAuth pega o token
  // if (!token) { // fetchWithAuth lida com ausência de token se a rota exigir
  //     window.location.href = 'login.html';
  //     return;
  // }

  try {
    const res = await fetchWithAuth(`${API_URL}/api/auth/profile`);
    if (res.ok) {
      const user = await res.json();
      const profileUsernameInput = document.getElementById('profile-username');
      const profileEmailInput = document.getElementById('profile-email');
      const welcomeMessageSpan = document.getElementById('welcome-message');

      if(profileUsernameInput) profileUsernameInput.value = user.name || '';
      if(profileEmailInput) profileEmailInput.value = user.email || '';
      if(welcomeMessageSpan) welcomeMessageSpan.textContent = `Bem-vindo, ${user.name || user.email}`;

    } else {
        // fetchWithAuth já lidou com 401. Se for outro erro, logar.
        if (res.status !== 401) {
           console.error("Erro ao buscar perfil:", res.status, await res.text());
        }
        // Não precisa de return aqui, pois o fluxo de erro já foi tratado ou será pelo catch
    }
  } catch (e) {
      console.error("Erro de rede ou falha no refresh ao buscar perfil:", e);
      // Se o erro for 'Falha ao renovar token.', o logout já foi chamado.
      // Se for outro erro de rede, o usuário pode já ter sido deslogado por fetchWithAuth.
  }

  document.getElementById('link-dashboard')?.addEventListener('click', e => { e.preventDefault(); showSection('dashboard-section'); });
  document.getElementById('link-history')?.addEventListener('click', e => { e.preventDefault(); showSection('history-section'); loadKeyHistory(); });
  document.getElementById('link-profile')?.addEventListener('click', e => { e.preventDefault(); showSection('profile-section'); });
  document.getElementById('link-documentation')?.addEventListener('click', e => { e.preventDefault(); showSection('documentation-section'); });
  document.getElementById('link-group-key')?.addEventListener('click', e => { e.preventDefault(); showSection('group-key-section'); loadGroupKeyManagementData(); });

  document.getElementById('link-logout')?.addEventListener('click', e => {
    e.preventDefault();
    handleLogout();
  });

  document.getElementById('link-open-key-modal')?.addEventListener('click', e => {
    e.preventDefault();
    openApiKeyModal();
  });
  document.getElementById('btn-get-api-key')?.addEventListener('click', e => {
    e.preventDefault();
    openApiKeyModal();
  });

  document.getElementById('btn-close-modal')?.addEventListener('click', () => {
    closeApiKeyModal();
  });

  const btnGenerateKey = document.getElementById('btn-generate-key');
  if (btnGenerateKey) {
    const newBtnGenerateKey = btnGenerateKey.cloneNode(true);
    btnGenerateKey.parentNode.replaceChild(newBtnGenerateKey, btnGenerateKey);
    newBtnGenerateKey.addEventListener('click', handleGenerateApiKey);
  }

  const historyTableBody = document.getElementById('api-key-history');
  if (historyTableBody) {
      historyTableBody.replaceWith(historyTableBody.cloneNode(true));
      document.getElementById('api-key-history').addEventListener('click', async (event) => {
        const deleteButton = event.target.closest('.btn-delete-key');
        if (deleteButton) {
            const keyToDelete = deleteButton.getAttribute('data-key');
            handleDeleteKey(keyToDelete);
        }
        const copyButton = event.target.closest('.btn-copy-key');
        if (copyButton) {
            const keyToCopy = copyButton.getAttribute('data-api-key');
            if (keyToCopy) {
                navigator.clipboard.writeText(keyToCopy).then(() => {
                    const icon = copyButton.querySelector('i');
                    if (icon) {
                        const originalIconClass = 'fa-copy';
                        icon.classList.remove(originalIconClass);
                        icon.classList.add('fa-check');
                        copyButton.disabled = true;

                        setTimeout(() => {
                            icon.classList.remove('fa-check');
                            icon.classList.add(originalIconClass);
                            copyButton.disabled = false;
                        }, 1500);
                    }
                }).catch(err => {
                    console.error('Erro ao copiar chave API:', err);
                    alert('Falha ao copiar a chave API.');
                });
            }
        }
     });
  }

  const apiKeyResultContainer = document.getElementById('api-key-result');
  if (apiKeyResultContainer) {
    apiKeyResultContainer.addEventListener('click', (event) => {
      const copyTextButton = event.target.closest('button[data-copy-text]');
      if (copyTextButton) {
        const textToCopy = copyTextButton.getAttribute('data-copy-text');
        copyToClipboard(textToCopy, copyTextButton);
      }

      const copyTargetButton = event.target.closest('button[data-copy-target-id]');
      if (copyTargetButton) {
        const targetId = copyTargetButton.getAttribute('data-copy-target-id');
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          copyToClipboard(targetElement.textContent || '', copyTargetButton);
        } else {
          console.error(`Elemento com ID "${targetId}" não encontrado para cópia.`);
        }
      }

      const docLink = event.target.closest('a.link-to-documentation');
      if (docLink) {
        event.preventDefault();
        showSection('documentation-section');
        closeApiKeyModal();
      }
    });
  }

  const btnEdit = document.getElementById('btn-edit-profile');
  const modalConfirm = document.getElementById('profile-confirm-modal');
  const modalEdit = document.getElementById('profile-edit-modal');
  const closeConfirm = document.getElementById('close-profile-confirm');
  const closeEdit = document.getElementById('close-profile-edit');
  const cancelEdit = document.getElementById('cancel-edit-profile');
  const confirmEdit = document.getElementById('confirm-edit-profile');
  const formEdit = document.getElementById('profile-edit-form');
  const msgEdit = document.getElementById('profile-edit-message');

  if (btnEdit && modalConfirm && modalEdit && closeConfirm && closeEdit && cancelEdit && confirmEdit && formEdit && msgEdit) {
      btnEdit.onclick = () => { modalConfirm.style.display = 'flex'; };
      closeConfirm.onclick = cancelEdit.onclick = () => { modalConfirm.style.display = 'none'; };
      confirmEdit.onclick = () => {
          modalConfirm.style.display = 'none';
          modalEdit.style.display = 'flex';
          const currentUsername = document.getElementById('profile-username')?.value;
          const currentEmail = document.getElementById('profile-email')?.value;
          const editUsernameInput = document.getElementById('edit-username');
          const editEmailInput = document.getElementById('edit-email');
          if(editUsernameInput) editUsernameInput.value = currentUsername || '';
          if(editEmailInput) editEmailInput.value = currentEmail || '';
      };
      closeEdit.onclick = () => { modalEdit.style.display = 'none'; msgEdit.textContent = ''; };
      formEdit.onsubmit = async e => {
          e.preventDefault();
          msgEdit.textContent = '';
          const newName = document.getElementById('edit-username').value;
          const newEmail = document.getElementById('edit-email').value;
          try {
              const res = await fetchWithAuth(`${API_URL}/api/auth/update-profile`, {
                  method: 'POST',
                  body: { name: newName, email: newEmail } // fetchWithAuth stringifica e adiciona Content-Type
              });
              const data = await res.json();
              if (!res.ok) {
                  msgEdit.textContent = data.message || 'Erro ao atualizar perfil';
                  msgEdit.style.color = '#e63946';
              } else {
                  msgEdit.textContent = 'Perfil atualizado com sucesso!';
                  msgEdit.style.color = '#28a745';
                  const profileUsernameInput = document.getElementById('profile-username');
                  const profileEmailInput = document.getElementById('profile-email');
                  if(profileUsernameInput) profileUsernameInput.value = newName;
                  if(profileEmailInput) profileEmailInput.value = newEmail; // Atualiza o email também
                  const welcomeMessageSpan = document.getElementById('welcome-message');
                  if(welcomeMessageSpan) welcomeMessageSpan.textContent = `Bem-vindo, ${newName}`;

                  setTimeout(() => { modalEdit.style.display = 'none'; msgEdit.textContent = ''; }, 1500);
              }
          } catch (err) {
              msgEdit.textContent = err.message || "Erro de conexão.";
              msgEdit.style.color = '#e63946';
          }
      };
  }

  const btnChangePassword = document.getElementById('btn-change-password');
  if (btnChangePassword) {
      btnChangePassword.addEventListener('click', () => {
          window.location.href = '/reset-password.html';
      });
  }

  await loadKeyHistory();
  await loadDashboardMetrics();

}

async function handleDeleteKey(key) {
  if (!key) return;

  const confirmed = window.confirm(`Tem certeza que deseja excluir a chave API "${key}"? Esta ação não pode ser desfeita.`);

  if (confirmed) {
    try {
      const response = await fetchWithAuth(`${API_URL}/api/keys/${key}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const rowToRemove = document.querySelector(`#api-key-history tr[data-key="${key}"]`);
        if (rowToRemove) {
          rowToRemove.remove();
        }
        alert('Chave API excluída com sucesso!');
        await loadDashboardMetrics();
      } else {
        const errorData = await response.json();
        alert(`Erro ao excluir chave: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      console.error('Erro na requisição de exclusão:', error);
      alert('Erro de rede ao tentar excluir a chave API.');
    }
  }
}

async function loadKeyHistory() {
  const tbody = document.getElementById('api-key-history');
  if (!tbody) return;

  try {
    const resp = await fetchWithAuth(`${API_URL}/api/keys`);
    if (!resp.ok) {
        // fetchWithAuth já lidou com 401. Se for outro erro, logar.
        if (resp.status !== 401) {
           console.error(`Erro ao buscar histórico: ${resp.statusText}`);
        }
        throw new Error(`Erro ao buscar histórico: ${resp.statusText}`); // Lança para o catch
    }
    const list = await resp.json();

    tbody.innerHTML = '';

    const thead = tbody.previousElementSibling;
    if (thead && !thead.querySelector('.action-header')) {
        const th = document.createElement('th');
        th.textContent = 'Ações';
        th.classList.add('action-header');
        thead.rows[0].appendChild(th);
    }

    if (list.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.textContent = 'Nenhuma chave API gerada ainda.';
        td.colSpan = 5;
        td.style.textAlign = 'center';
        tr.appendChild(td);
        tbody.appendChild(tr);
    } else {
        list.forEach(item => {
          const tr = document.createElement('tr');
          tr.setAttribute('data-key', item.key);
          tr.innerHTML = `
            <td>${item.key}</td>
            <td>${item.projectName || '-'}</td>
            <td>${new Date(item.createdAt).toLocaleDateString()}</td>
            <td style="text-align: center;">
              <button class="btn-copy-key" data-api-key="${item.key}" title="Copiar Chave">
                <i class="fas fa-copy"></i>
              </button>
            </td>
            <td style="text-align: center;">
              <button class="btn-delete-key" data-key="${item.key}" title="Excluir Chave">
                <i class="fas fa-trash-alt"></i>
              </button>
            </td>
          `;
          tbody.appendChild(tr);
        });
    }
  } catch (err) {
    console.error("Erro ao carregar histórico de chaves:", err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Erro ao carregar histórico.</td></tr>';
  }
}

async function loadDashboardMetrics() {
  // const token = sessionStorage.getItem('token'); // fetchWithAuth pega o token
  // if (!token) return;

  try {
    const keyCount = document.querySelectorAll('#api-key-history tr[data-key]').length;
    const apiKeyCountEl = document.getElementById('api-keys-count');
    if(apiKeyCountEl) apiKeyCountEl.textContent = keyCount;

    const respKeysForGroups = await fetchWithAuth(`${API_URL}/api/keys`);
    let uniqueGroupCount = 0;
    if (respKeysForGroups.ok) {
        const keysData = await respKeysForGroups.json(); // Renomeado para keysData para evitar conflito
        const uniqueGroups = new Set();
        keysData.forEach(key => {
            if (key.projectGroupKey) {
                uniqueGroups.add(key.projectGroupKey);
            }
        });
        uniqueGroupCount = uniqueGroups.size;
    }
    const groupCountEl = document.getElementById('project-group-count'); // Usa o novo ID
    if(groupCountEl) groupCountEl.textContent = uniqueGroupCount;


    // Dados seguros - Remover x-organization-key se a rota /api/secure-data não precisar mais dele
    // Verifique a implementação de routes/secureData.js
    const respSecure = await fetch(`${API_URL}/api/secure-data`, {
      headers: { 'Authorization': `Bearer ${token}` } // Removido 'x-organization-key' - VERIFICAR ROTA
    });
    if (respSecure.ok) {
        const secureList = await respSecure.json();
        const secureDataCountEl = document.getElementById('secure-data-count');
        if(secureDataCountEl) secureDataCountEl.textContent = secureList.length;
    }
  } catch (err) {
    console.error('Erro ao carregar métricas do dashboard:', err);
  }
}

// Função para abrir modal de API Key
window.openApiKeyModal = function() {
    const modal = document.getElementById('api-key-modal');
    if(modal) modal.style.display = 'flex'; // Usa flex para centralizar
};

// Função para fechar modal de API Key
window.closeApiKeyModal = function() {
  const modal = document.getElementById('api-key-modal');
  if (modal) modal.style.display = 'none';
  const msg = document.getElementById('api-key-message');
  if (msg) msg.textContent = ''; // Limpa mensagem ao fechar
  // Limpa campos do formulário ao fechar
  const emailInput = document.getElementById('api-key-email');
  const projectInput = document.getElementById('api-key-project');
  const siteInput = document.getElementById('api-key-site');
  // if(emailInput) emailInput.value = ''; // Email foi removido
  if(projectInput) projectInput.value = '';
  if(siteInput) siteInput.value = '';
};

// Função para lidar com geração de chave (chamada pelo listener em initDashboard)
async function handleGenerateApiKey(event) {
  event.preventDefault();
  const btnGenerate = event.target.closest('button'); // Pega o botão
  const projectName = document.getElementById('api-key-project').value.trim();
  // const siteLabel = document.getElementById('api-key-site').value.trim(); // Removido
  const msgEl = document.getElementById('api-key-message');

  // Ajusta validação para exigir apenas o nome do projeto
  if (!projectName) {
    msgEl.textContent = 'Preencha o Nome do Projeto.'; msgEl.style.color = '#e63946'; // Mensagem atualizada
    return;
  }

  const token = sessionStorage.getItem('token');
  if(btnGenerate) btnGenerate.disabled = true; // Desabilita o botão
  msgEl.textContent = 'Gerando chave...';
  msgEl.style.color = '#007bff';
  msgEl.style.display = 'block'; // Garante que a mensagem de carregamento seja visível

  const resultEl = document.getElementById('api-key-result'); // Elemento para exibir o resultado final
  resultEl.style.display = 'none'; // Esconde resultado anterior
  resultEl.innerHTML = '';

  try {
    const resp = await fetchWithAuth(`${API_URL}/api/keys`, {
      method: 'POST',
      body: { projectName } // fetchWithAuth lida com headers e stringify
    });

    // Tenta ler o corpo da resposta mesmo se não for OK, pois pode conter a mensagem de erro
    let data;
    try {
        data = await resp.json();
    } catch (e) {
        // Se falhar ao parsear JSON (ex: resposta vazia ou não-JSON)
        data = { message: `Erro ${resp.status}: ${resp.statusText}` };
    }


    if (!resp.ok) {
      // Exibe erro no elemento de mensagem principal
      msgEl.textContent = data.message || `Erro ${resp.status} ao gerar chave.`;
      msgEl.style.color = '#e63946'; // Vermelho para erro
      if(btnGenerate) btnGenerate.disabled = false; // Reabilita o botão em caso de erro
    } else {
      // Sucesso! Processa a resposta do backend
      msgEl.style.display = 'none'; // Esconde mensagem de carregamento

      const { apiKey, organizationKey, organizationKeyInfo } = data;
      const resultEl = document.getElementById('api-key-result'); // Pega o elemento de resultado
      const btnGenerate = event.target.closest('button'); // Garante que temos o botão aqui

      // --- Construção do HTML de Resultado ---
      let resultHTML = `
        <p><strong>API Key Gerada:</strong></p>
        <pre style="position: relative;"><code>${apiKey}</code><button class="copy-button-modal" data-copy-text="${apiKey}">Copiar</button></pre>
      `;

      // Adiciona Organization Key se existir
      if (organizationKey) {
        // Usa organizationKeyInfo como tooltip se for string, senão usa texto padrão
        const tooltipText = (typeof organizationKeyInfo === 'string' ? organizationKeyInfo : 'Chave associada à sua organização/site.');
        resultHTML += `
          <p style="margin-top:10px;"><strong>Organization Key Associada:</strong> <span class="info-tooltip" title="${tooltipText}">(?)</span></p>
          <pre style="position: relative;"><code>${organizationKey}</code><button class="copy-button-modal" data-copy-text="${organizationKey}">Copiar</button></pre>
        `;
      }

      // Adiciona a explicação detalhada da Organization Key se for um objeto
      if (organizationKeyInfo && typeof organizationKeyInfo === 'object') {
        resultHTML += `
          <div style="margin-top: 15px; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; background-color: rgba(255,255,255,0.05);">
            <h5 style="margin-top: 0; color: var(--accent-purple);"><i class="fas fa-info-circle"></i> ${organizationKeyInfo.title || 'Sobre a Organization Key'}</h5>
            <p style="font-size: 0.9em; color: var(--text-medium); margin-bottom: 0;">${organizationKeyInfo.explanation || 'Use esta chave para conectar múltiplas aplicações aos mesmos dados de login.'}</p>
          </div>
        `;
      }

      // Adiciona Exemplo cURL
      // Garante que a origem da URL esteja correta (sem / no final se já tiver em /api)
      const origin = window.location.origin;
      const curlExample = `curl -X POST ${origin}/api/client/register \\\\
 -H "Content-Type: application/json" \\\\
 -H "x-api-key: ${apiKey}" \\\\
 -d '{"email": "usuario@exemplo.com", "password": "senhaForte123"}'`;
      const codeId = `curl-example-${apiKey}`; // ID único para o botão copiar

      resultHTML += `
        <p style="margin-top:15px;"><strong>Exemplo de uso (cURL para registrar usuário):</strong></p>
        <div style="position: relative;">
          <pre style="background:#161b22; color:#c9d1d9; border:1px solid #30363d; padding:15px; border-radius:8px; font-size:0.85em; overflow-x:auto; padding-right: 60px;">
            <code id="${codeId}">${curlExample.replace(/</g, '<').replace(/>/g, '>')}</code>
          </pre>
          <button class="copy-button-modal" data-copy-target-id="${codeId}">COPY</button>
        </div>
        <p style="font-size: 0.9em; margin-top: 10px;">Consulte a seção <a href="#" class="link-to-documentation">Documentação</a> para mais detalhes.</p>
      `;

      // --- Atualiza a UI ---
      resultEl.innerHTML = resultHTML;
      resultEl.style.display = 'block'; // Mostra o resultado
      resultEl.style.color = 'var(--text-color)'; // Cor padrão do texto

      // Limpa o input e atualiza a lista de chaves (usando await)
      document.getElementById('api-key-project').value = '';
      await loadKeyHistory(); // Atualiza a tabela de chaves

      // Reabilita o botão após sucesso para permitir gerar outra chave
      if(btnGenerate) btnGenerate.disabled = false;

    }
  } catch (err) { // Bloco catch correto
    console.error('Erro na função handleGenerateApiKey:', err);
    const msgEl = document.getElementById('api-key-message'); // Garante que temos msgEl
    const resultEl = document.getElementById('api-key-result'); // Garante que temos resultEl
    const btnGenerate = document.querySelector('#api-key-modal button[type="submit"]'); // Seleciona o botão pelo contexto

    // Usa msgEl para erros, resultEl para sucesso
    msgEl.textContent = err.message || "Erro de conexão ao gerar chave.";
    msgEl.style.color = '#e63946';
    msgEl.style.display = 'block'; // Garante que a mensagem de erro seja visível
    if(resultEl) resultEl.style.display = 'none'; // Esconde a área de resultado em caso de erro
    if(btnGenerate) btnGenerate.disabled = false; // Reabilita o botão em caso de erro
  } finally { // Bloco finally correto
     // O botão já é tratado nos blocos try/catch/else, finally pode ficar vazio ou fazer cleanup geral se necessário.
     // console.log("Geração de chave finalizada.");
  }
}

// Função auxiliar para copiar texto (pode já existir ou ser melhorada)
function copyToClipboard(text, buttonElement) {
    navigator.clipboard.writeText(text).then(() => {
        if(buttonElement) {
            const originalText = buttonElement.innerHTML;
            buttonElement.innerHTML = '<i class="fas fa-check"></i> Copiado';
            buttonElement.disabled = true;
            setTimeout(() => {
                buttonElement.innerHTML = originalText;
                buttonElement.disabled = false;
            }, 1500);
        }
    }).catch(err => {
        console.error('Erro ao copiar:', err);
        // Adicionar feedback de erro para o usuário se necessário
    });
}


// Função para lidar com a alteração de senha
async function handleChangePassword() {
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmNewPassword = document.getElementById('confirm-new-password').value;
  const msgEl = document.getElementById('change-password-message');
  const modal = document.getElementById('change-password-modal');
  const form = document.getElementById('change-password-form');
  const submitButton = form.querySelector('button[type="submit"]');

  msgEl.textContent = ''; // Limpa mensagem anterior

  // Validações básicas no frontend
  if (!currentPassword || !newPassword || !confirmNewPassword) {
    msgEl.textContent = 'Por favor, preencha todos os campos.';
    msgEl.style.color = '#e63946'; // Vermelho para erro
    return;
  }

  if (newPassword !== confirmNewPassword) {
    msgEl.textContent = 'A nova senha e a confirmação não coincidem.';
    msgEl.style.color = '#e63946';
    return;
  }

  if (newPassword.length < 6) { // Exemplo de validação de comprimento mínimo
    msgEl.textContent = 'A nova senha deve ter pelo menos 6 caracteres.';
    msgEl.style.color = '#e63946';
    return;
  }

  const token = sessionStorage.getItem('token');
  if (!token) {
      handleLogout(); // Desloga se não houver token
      return;
  }

  if (submitButton) submitButton.disabled = true; // Desabilita botão durante a requisição
  msgEl.textContent = 'Alterando senha...';
  msgEl.style.color = '#007bff'; // Azul para carregamento

  try {
    // Reescrevendo a chamada fetch para garantir a sintaxe
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token, // Usando concatenação em vez de template literal
        // 'x-organization-key' removido
      },
      body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword }) // Sendo explícito
    };
    const response = await fetchWithAuth(API_URL + '/api/auth/change-password', fetchOptions);

    const data = await response.json();

    if (!response.ok) {
      msgEl.textContent = data.message || 'Erro ao alterar senha.';
      msgEl.style.color = '#e63946';
    } else {
      msgEl.textContent = 'Senha alterada com sucesso!';
      msgEl.style.color = '#28a745'; // Verde para sucesso
      form.reset(); // Limpa o formulário
      setTimeout(() => {
        if (modal) modal.style.display = 'none'; // Fecha o modal após sucesso
        msgEl.textContent = ''; // Limpa a mensagem
      }, 2000); // Fecha após 2 segundos
    }
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    msgEl.textContent = 'Erro de conexão ao tentar alterar a senha.';
    msgEl.style.color = '#e63946';
  } finally {
    if (submitButton) submitButton.disabled = false; // Reabilita o botão
  }
}

// Função de Logout (atualizada)
window.handleLogout = function() {
    // Opcional: Chamar API de logout no backend para invalidar refresh token
    const token = sessionStorage.getItem('token');
    if (token) {
        fetchWithAuth(`${API_URL}/api/auth/logout`, { // Usa fetchWithAuth
            method: 'POST',
            // Headers de autorização são adicionados por fetchWithAuth
        }).catch(err => console.error("Erro ao chamar API de logout:", err)); // Continua mesmo se falhar
    }
    sessionStorage.clear(); // Limpa tudo
    window.location.href = 'login.html'; // Redireciona para a página de login
};
// --- Funções para Botão Copiar na Documentação ---

function setupCopyButtons() {
  const docSection = document.getElementById('documentation-section');
  if (!docSection) return;

  const codeBlocks = docSection.querySelectorAll('pre'); // Seleciona todos os <pre> na documentação

  codeBlocks.forEach(preElement => {
    // Evita adicionar botão se já existir
    if (preElement.querySelector('.copy-button')) {
      return;
    }

    const codeElement = preElement.querySelector('code');
    if (!codeElement) return; // Pula se não houver <code> dentro do <pre>

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.textContent = 'COPY';
    copyButton.title = 'Copiar código'; // Tooltip

    copyButton.addEventListener('click', () => {
      const codeToCopy = codeElement.textContent || '';
      navigator.clipboard.writeText(codeToCopy).then(() => {
        copyButton.textContent = 'COPIED!';
        copyButton.disabled = true; // Desabilita temporariamente
        setTimeout(() => {
          copyButton.textContent = 'COPY';
          copyButton.disabled = false; // Reabilita
        }, 1500); // Volta ao normal após 1.5 segundos
      }).catch(err => {
        console.error('Erro ao copiar para a área de transferência:', err);
        copyButton.textContent = 'Error'; // Indica erro
         setTimeout(() => {
          copyButton.textContent = 'COPY';
        }, 1500);
      });
    });

    preElement.appendChild(copyButton); // Adiciona o botão ao <pre>
    preElement.style.position = 'relative'; // Garante que o <pre> seja o container de posicionamento
  });
}

// Modifica a função showSection para chamar setupCopyButtons
// (Esta parte precisa ser feita manualmente ou com apply_diff na função showSection existente)
// Exemplo de como ficaria dentro de showSection:
/*
  ...
  if(sectionToShow) {
      sectionToShow.style.display = 'block';
      void sectionToShow.offsetWidth;
      sectionToShow.classList.add('active');
      // Chama a configuração dos botões se for a seção de documentação
      if (id === 'documentation-section') {
          setupCopyButtons();
      }
  } else {
  ...
*/

// --- Navigation Functions ---

function showSection(sectionId) {
  // Hide all sections
  document.querySelectorAll('.main-content .section').forEach(section => {
    section.classList.remove('active');
    section.style.display = 'none'; // Ensure it's hidden
  });

  // Show the target section
  const sectionToShow = document.getElementById(sectionId);
  if (sectionToShow) {
    sectionToShow.style.display = 'block'; // Make it visible
    // Use a slight delay for the transition effect if desired, or just add class
    setTimeout(() => {
        sectionToShow.classList.add('active');
    }, 10); // Small delay helps CSS transitions sometimes
  } else {
    console.warn(`Section with ID "${sectionId}" not found.`);
    // Optionally show a default section like dashboard
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection) {
        dashboardSection.style.display = 'block';
        setTimeout(() => {
            dashboardSection.classList.add('active');
        }, 10);
    }
  }

  // Update active link in sidebar
  document.querySelectorAll('.sidebar ul li a').forEach(link => {
    link.classList.remove('active');
  });
  // Construct the potential link ID based on the section ID
  const linkId = `link-${sectionId.replace('-section', '')}`;
  const activeLink = document.getElementById(linkId);
  if (activeLink) {
    activeLink.classList.add('active');
  } else {
      // Fallback or default active link if specific one not found (e.g., dashboard)
      const dashboardLink = document.getElementById('link-dashboard');
      if(dashboardLink) dashboardLink.classList.add('active');
  }

  // Special handling for documentation copy buttons if needed
  if (sectionId === 'documentation-section' && typeof setupCopyButtons === 'function') {
      setupCopyButtons();
  }

  // Close mobile sidebar if open
  document.body.classList.remove('sidebar-mobile-open');
}

// Function to close the API key modal
function closeApiKeyModal() {
    const modal = document.getElementById('api-key-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Function to open the API key modal
function openApiKeyModal() {
    const modal = document.getElementById('api-key-modal');
    const msgEl = document.getElementById('api-key-message');
    const resultEl = document.getElementById('api-key-result');
    const inputEl = document.getElementById('api-key-project');
    // More robust selector for the generate button
    const btnGenerate = document.querySelector('#api-key-modal button#btn-generate-key');

    if (modal) {
        // Reset modal state before showing
        const inputEl = document.getElementById('api-key-project'); // Definir inputEl aqui
        const resultEl = document.getElementById('api-key-result'); // Definir resultEl aqui
        const btnGenerate = document.querySelector('#api-key-modal button#btn-generate-key'); // Definir btnGenerate aqui

        if(inputEl) {
             inputEl.value = '';
             // Limpa resultado anterior e reabilita botão quando o usuário foca no input
             const focusHandler = () => {
                 if(resultEl) {
                     resultEl.innerHTML = '';
                     resultEl.style.display = 'none';
                 }
                 if(btnGenerate) btnGenerate.disabled = false; // Garante que o botão está habilitado
                 // Remove o listener após a primeira execução para não limpar toda vez
                 inputEl.removeEventListener('focus', focusHandler);
             };
             inputEl.addEventListener('focus', focusHandler);
        }
        if(msgEl) { // msgEl já está definido no escopo externo
            msgEl.textContent = '';
            msgEl.style.display = 'none';
        }
        if(resultEl) {
            resultEl.innerHTML = '';
            resultEl.style.display = 'none';
        }
        if(btnGenerate) btnGenerate.disabled = false; // Ensure button is enabled initially

        modal.style.display = 'flex'; // Show modal using flex for centering
    }
}

// --- Funções para Gerenciamento de Chave de Grupo ---

// Carrega dados na tabela de gerenciamento de chaves de grupo
async function loadGroupKeyManagementData() {
  const token = sessionStorage.getItem('token');
  const tbody = document.getElementById('group-key-table-body');
  if (!tbody || !token) return;

  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando...</td></tr>'; // Feedback de carregamento

  try {
    // Usa a mesma rota GET /api/keys que agora retorna projectGroupKey
    const resp = await fetchWithAuth(`${API_URL}/api/keys`); // fetchWithAuth lida com headers

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) handleLogout();
      throw new Error(`Erro ao buscar chaves: ${resp.statusText}`);
    }
    const keys = await resp.json();

    tbody.innerHTML = ''; // Limpa a tabela

    if (keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhuma chave API encontrada. Gere uma chave primeiro.</td></tr>';
    } else {
      keys.forEach(apiKey => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${apiKey.projectName || '-'}</td>
          <td>${apiKey.key}</td>
          <td><code>${apiKey.projectGroupKey || 'Nenhum'}</code></td>
          <td>
            <button class="btn btn-sm btn-manage-group" data-key="${apiKey.key}" data-project-name="${apiKey.projectName || ''}" data-current-group="${apiKey.projectGroupKey || ''}">
              <i class="fas fa-edit"></i> Gerenciar
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error("Erro ao carregar dados de gerenciamento de grupo:", err);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
  }
}

// Adiciona listener para abrir o modal de gerenciamento (delegação)
document.addEventListener('click', (event) => {
    const manageButton = event.target.closest('.btn-manage-group');
    if (manageButton) {
        const apiKey = manageButton.getAttribute('data-key');
        const projectName = manageButton.getAttribute('data-project-name');
        const currentGroup = manageButton.getAttribute('data-current-group');
        openManageGroupModal(apiKey, projectName, currentGroup);
    }
});

// Abre e preenche o modal de gerenciamento
function openManageGroupModal(apiKey, projectName, currentGroup) {
    const modal = document.getElementById('manage-group-key-modal');
    if (!modal) return;

    // Preenche os dados da chave selecionada
    document.getElementById('manage-group-project-name').textContent = projectName || 'Projeto Sem Nome';
    document.getElementById('manage-group-api-key').textContent = apiKey;
    document.getElementById('manage-group-current-key').textContent = currentGroup || 'Nenhum';

    // Armazena a chave API atual no modal para referência posterior
    modal.setAttribute('data-current-api-key', apiKey);

    // Reseta o estado do modal
    document.getElementById('associate-existing-group-div').style.display = 'none';
    document.getElementById('existing-group-key-input').value = '';
    const msgEl = document.getElementById('manage-group-key-message');
    if(msgEl) msgEl.textContent = '';

    // Exibe o modal
    modal.style.display = 'flex';
}

// Fecha o modal de gerenciamento
function closeManageGroupModal() {
    const modal = document.getElementById('manage-group-key-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Adiciona listeners aos elementos do modal de gerenciamento
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('manage-group-key-modal');
    if (!modal) return;

    // Botão Fechar
    document.getElementById('close-manage-group-modal')?.addEventListener('click', closeManageGroupModal);

    // Botão Gerar Nova
    document.getElementById('btn-generate-new-group-key')?.addEventListener('click', () => {
        const apiKey = modal.getAttribute('data-current-api-key');
        associateGroupKey(apiKey, 'generate'); // Usa 'generate' como sinalizador
    });

    // Botão Remover Associação
    document.getElementById('btn-remove-group-association')?.addEventListener('click', () => {
        const apiKey = modal.getAttribute('data-current-api-key');
        if (confirm(`Tem certeza que deseja remover a associação de grupo para a chave API ${apiKey}?`)) {
            associateGroupKey(apiKey, null); // Envia null para remover
        }
    });

    // Botão Associar Existente (mostra o campo de input)
    document.getElementById('btn-associate-existing-group-key')?.addEventListener('click', () => {
        document.getElementById('associate-existing-group-div').style.display = 'block';
    });

    // Botão Confirmar Associação (pega valor do input)
    document.getElementById('btn-confirm-association')?.addEventListener('click', () => {
        const apiKey = modal.getAttribute('data-current-api-key');
        const existingKey = document.getElementById('existing-group-key-input').value.trim();
        if (existingKey) {
            associateGroupKey(apiKey, existingKey);
        } else {
            const msgEl = document.getElementById('manage-group-key-message');
            if(msgEl) {
                msgEl.textContent = 'Por favor, insira uma chave de grupo existente.';
                msgEl.style.color = '#e63946';
            }
        }
    });
});


// Função para chamar a API e associar/gerar/remover chave de grupo
async function associateGroupKey(apiKey, groupKeyValue) {
    const token = sessionStorage.getItem('token');
    const modal = document.getElementById('manage-group-key-modal');
    const msgEl = document.getElementById('manage-group-key-message');
    if (!modal || !msgEl || !token || !apiKey) return;

    msgEl.textContent = 'Processando...';
    msgEl.style.color = '#007bff';

    try {
        const resp = await fetchWithAuth(`${API_URL}/api/keys/${apiKey}/associate-group`, {
            method: 'POST',
            body: { projectGroupKey: groupKeyValue } // fetchWithAuth lida com headers e stringify
        });

        const result = await resp.json();

        if (!resp.ok) {
            throw new Error(result.message || `Erro ${resp.status}`);
        }

        msgEl.textContent = 'Associação de grupo atualizada com sucesso!';
        msgEl.style.color = '#28a745';

        // Atualiza a tabela e fecha o modal após um delay
        await loadGroupKeyManagementData(); // Recarrega a tabela
        setTimeout(() => {
            closeManageGroupModal();
        }, 1500);

    } catch (err) {
        console.error("Erro ao associar chave de grupo:", err);
        msgEl.textContent = `Erro: ${err.message}`;
        msgEl.style.color = '#e63946';
    }
}
