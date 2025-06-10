// Importa a SDK (assumindo que está instalada via npm)
// Em um cenário real, você pode precisar ajustar o caminho
// dependendo da sua estrutura de projeto e bundler.
// Se a SDK não for um pacote publicado, ajuste o caminho de importação.
// Ex: import NeuraloginsClient from './path/to/sdk/index.js';
import NeuraloginsClient from 'neuralogins-client';

// Elementos da UI
const apiUrlInput = document.getElementById('apiUrl');
const apiKeyInput = document.getElementById('apiKey');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const registerBtn = document.getElementById('registerBtn');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const getDataBtn = document.getElementById('getDataBtn');
const statusArea = document.getElementById('statusArea');

let neuralogins = null; // Instância da SDK será criada dinamicamente
let currentAccessToken = null; // Para manter o token atual em memória (opcional, mas pode ser útil)
let currentRefreshToken = null;

// Constantes para as chaves do localStorage
const ACCESS_TOKEN_KEY = 'neuralogins_accessToken';
const REFRESH_TOKEN_KEY = 'neuralogins_refreshToken';

// Função para atualizar a área de status
function updateStatus(message, isError = false) {
    statusArea.textContent = typeof message === 'object' ? JSON.stringify(message, null, 2) : message;
    statusArea.style.color = isError ? 'red' : 'green';
    console.log(message); // Log no console também
}

// Função para inicializar a SDK com os valores dos inputs
function initializeSdk() {
    const apiUrl = apiUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!apiUrl || !apiKey) {
        updateStatus('Erro: API URL e API Key são obrigatórios.', true);
        return false;
    }

    try {
        neuralogins = new NeuraloginsClient({ apiUrl, apiKey });
        updateStatus('SDK inicializada com sucesso.');
        return true;
    } catch (error) {
        updateStatus(`Erro ao inicializar SDK: ${error.message}`, true);
        console.error(error);
        return false;
    }
}

// Função para habilitar/desabilitar botões pós-login
function setLoggedInState(isLoggedIn) {
    logoutBtn.disabled = !isLoggedIn;
    getDataBtn.disabled = !isLoggedIn;
    loginBtn.disabled = isLoggedIn;
    registerBtn.disabled = isLoggedIn;
    emailInput.disabled = isLoggedIn;
    passwordInput.disabled = isLoggedIn;

    // Limpa a área de status se estiver deslogando
    if (!isLoggedIn) {
        statusArea.textContent = 'Pronto.';
        statusArea.style.color = 'black';
    }
}

// Função para limpar tokens do localStorage e da memória
function clearTokens() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    currentAccessToken = null;
    currentRefreshToken = null;
}

// Função para salvar tokens no localStorage e na memória
function saveTokens(accessToken, refreshToken) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    currentAccessToken = accessToken;
    currentRefreshToken = refreshToken;
}

// Event Listeners
registerBtn.addEventListener('click', async function() {
    if (!initializeSdk()) return;
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) {
        updateStatus('Erro: Email e Senha são obrigatórios para registro.', true);
        return;
    }
    updateStatus('Registrando...');
    try {
        const result = await neuralogins.registerEndUser(email, password);
        updateStatus(`Registro bem-sucedido: ${JSON.stringify(result, null, 2)}`);
    } catch (error) {
        updateStatus(`Erro no registro: ${error.message}`, true);
        console.error(error);
    }
});

loginBtn.addEventListener('click', async function() {
    if (!initializeSdk()) return;
    const email = emailInput.value;
    const password = passwordInput.value;
     if (!email || !password) {
        updateStatus('Erro: Email e Senha são obrigatórios para login.', true);
        return;
     }
    updateStatus('Fazendo login...');
    try {
        const result = await neuralogins.loginEndUser(email, password);
        updateStatus(`Login bem-sucedido! Usuário: ${JSON.stringify(result.user, null, 2)}`);
        // Armazena os tokens retornados no localStorage
        if (result.accessToken && result.refreshToken) {
            saveTokens(result.accessToken, result.refreshToken);
            updateStatus(`Login bem-sucedido! Tokens armazenados. Usuário: ${JSON.stringify(result.user, null, 2)}`);
            setLoggedInState(true);
        } else {
            updateStatus('Erro: Login bem-sucedido, mas tokens não foram retornados.', true);
            clearTokens(); // Garante que não haja tokens antigos
            setLoggedInState(false);
        }
    } catch (error) {
        updateStatus(`Erro no login: ${error.message}`, true);
        clearTokens(); // Limpa tokens em caso de erro no login
        console.error(error);
        setLoggedInState(false);
    }
});

logoutBtn.addEventListener('click', async function() {
    if (!neuralogins) {
         updateStatus('Erro: SDK não inicializada.', true);
         return;
     }
    updateStatus('Fazendo logout...');
    try {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        if (refreshToken) {
            await neuralogins.logout(refreshToken); // Passa o refresh token
            updateStatus('Logout solicitado ao servidor.');
        } else {
            updateStatus('Nenhum refresh token encontrado localmente para invalidar no servidor, limpando localmente.');
        }
    } catch (error) {
        // Mesmo que o logout no servidor falhe (ex: token já inválido), continuamos limpando localmente.
        updateStatus(`Erro ao tentar invalidar token no servidor (pode já estar inválido): ${error.message}. Limpando localmente.`, true);
        console.error("Erro na chamada de logout API:", error);
    } finally {
        // SEMPRE limpa os tokens locais e atualiza a UI no logout
        clearTokens();
        setLoggedInState(false);
        emailInput.value = ''; // Limpa campos
        passwordInput.value = '';
        updateStatus('Logout local concluído.'); // Mensagem final
    }
});

// Função wrapper para chamadas API protegidas com lógica de refresh token
async function callProtectedApi(apiCallFunction) {
    if (!neuralogins) {
        throw new Error('SDK não inicializada.');
    }

    let accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!accessToken) {
        updateStatus('Erro: Access token não encontrado. Faça login.', true);
        setLoggedInState(false); // Garante que está deslogado
        throw new Error('Access token não encontrado.');
    }

    try {
        // Primeira tentativa com o token atual
        updateStatus('Tentando chamada API com token atual...');
        return await apiCallFunction(accessToken);
    } catch (error) {
        // Se o erro for 401 (Unauthorized), tenta refresh
        if (error.status === 401) {
            updateStatus('Token de acesso expirado ou inválido (401). Tentando refresh...', true);
            const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

            if (!refreshToken) {
                updateStatus('Erro: Refresh token não encontrado para renovar a sessão. Faça login novamente.', true);
                clearTokens();
                setLoggedInState(false);
                throw new Error('Refresh token não encontrado.');
            }

            try {
                // Tenta obter novos tokens
                updateStatus('Solicitando novos tokens com refresh token...');
                const refreshResult = await neuralogins.refreshAccessToken(refreshToken);

                if (refreshResult.accessToken && refreshResult.refreshToken) {
                    updateStatus('Novos tokens recebidos com sucesso. Armazenando...');
                    saveTokens(refreshResult.accessToken, refreshResult.refreshToken);

                    // Segunda tentativa com o novo token de acesso
                    updateStatus('Tentando chamada API novamente com o novo token...');
                    return await apiCallFunction(refreshResult.accessToken);
                } else {
                    updateStatus('Erro: Falha ao obter novos tokens (resposta inválida do refresh). Faça login novamente.', true);
                    clearTokens();
                    setLoggedInState(false);
                    throw new Error('Falha ao obter novos tokens válidos.');
                }
            } catch (refreshError) {
                // Se o refresh falhar (ex: refresh token inválido/expirado)
                updateStatus(`Erro ao tentar renovar a sessão com refresh token: ${refreshError.message}. Faça login novamente.`, true);
                console.error("Erro no refresh token:", refreshError);
                clearTokens();
                setLoggedInState(false);
                throw new Error(`Falha ao renovar sessão: ${refreshError.message}`);
            }
        } else {
            // Se for outro erro, apenas relança
            updateStatus(`Erro na chamada API: ${error.message}`, true);
            console.error("Erro na chamada API protegida:", error);
            throw error; // Relança o erro original
        }
    }
}


getDataBtn.addEventListener('click', async function() {
    updateStatus('Buscando dados protegidos...');
    try {
        // Chama a função wrapper, passando a chamada real da SDK como argumento
        // O wrapper cuidará de passar o accessToken correto
        const data = await callProtectedApi(
            (token) => neuralogins.getProtectedData(token) // A função que realmente chama a API
        );
        updateStatus(`Dados protegidos recebidos: ${JSON.stringify(data, null, 2)}`);
    } catch (error) {
        // O erro já foi tratado e logado dentro de callProtectedApi
        // A UI (setLoggedInState) também já foi atualizada lá em caso de falha irrecuperável
        updateStatus(`Falha final ao buscar dados protegidos: ${error.message}`, true);
        // Não precisa mais verificar 401 aqui, pois callProtectedApi já tratou ou falhou
    }
});

// Função para verificar o estado inicial de autenticação ao carregar
function checkInitialAuthState() {
    const storedAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

    if (storedAccessToken && storedRefreshToken) {
        updateStatus('Tokens encontrados no localStorage. Considerando usuário logado.');
        // Poderíamos opcionalmente validar o token aqui ou apenas assumir que está logado
        // e deixar a primeira chamada API falhar e tentar o refresh se necessário.
        currentAccessToken = storedAccessToken; // Atualiza variável local
        currentRefreshToken = storedRefreshToken;
        setLoggedInState(true);
        // Tenta inicializar a SDK se os inputs estiverem preenchidos (caso o usuário recarregue a página)
        initializeSdk();
    } else {
        updateStatus('Nenhum token encontrado. Usuário deslogado.');
        setLoggedInState(false);
    }
}

 // Inicializa o estado dos botões e verifica tokens ao carregar
 checkInitialAuthState();