/**
 * ========================================
 * PETRAGLOBAL ENERGY - DASHBOARD DE PETRÓLEO
 * ========================================
 * Sistema completo de monitoramento de preços do petróleo
 * Funcionalidades:
 * - Visualização de preços em tempo real
 * - Gráficos 3D interativos com Plotly.js
 * - Sistema de compras com validação
 * - Sugestões inteligentes de IA
 * - Histórico de transações
 * - Armazenamento local com IndexedDB
 * ========================================
 */

// Import Plotly.js
const Plotly = window.Plotly

// ========================================
// VARIÁVEIS GLOBAIS
// ========================================

/**
 * Instância do banco de dados IndexedDB
 * Usado para armazenar preços históricos e compras
 * @type {IDBDatabase}
 */
let db

/**
 * Referência ao container do gráfico Plotly
 * Usado para atualizações dinâmicas do gráfico 3D
 * @type {HTMLElement}
 */
let chartInstance = null

/**
 * Armazena os preços atuais de cada símbolo
 * @type {Object}
 */
const precosAtuais = {
  BRENT: 85.5,
  WTI: 82.75,
  OPEC: 84.2,
}

/**
 * Armazena o histórico de preços para sparklines
 * @type {Object}
 */
const historicoSparkline = {
  BRENT: [85.5],
  WTI: [82.75],
  OPEC: [84.2],
}

/**
 * Intervalo de atualização em tempo real (em milissegundos)
 * @type {number}
 */
const INTERVALO_ATUALIZACAO = 3000 // 3 segundos

/**
 * Contador de atualizações
 * @type {number}
 */
let contadorAtualizacoes = 0

/**
 * Configuração das chaves de API
 * Substitua com suas chaves reais para produção
 * @type {Object}
 */
const API_CONFIG = {
  alphaVantage: "DEMO", // API para dados financeiros
  openAI: "", // API para sugestões de IA
}

// ========================================
// INICIALIZAÇÃO DO BANCO DE DADOS
// ========================================

/**
 * Abre conexão com o banco de dados IndexedDB
 * Cria as tabelas necessárias se não existirem
 */
const request = indexedDB.open("PetroleoDB", 1)

/**
 * Evento disparado quando o banco precisa ser atualizado
 * Cria as object stores (tabelas) necessárias
 */
request.onupgradeneeded = (event) => {
  db = event.target.result

  // Cria tabela de preços históricos se não existir
  if (!db.objectStoreNames.contains("PrecosHistoricos")) {
    const precosStore = db.createObjectStore("PrecosHistoricos", {
      keyPath: "id",
      autoIncrement: true,
    })
    // Índices para busca rápida
    precosStore.createIndex("simbolo", "simbolo", { unique: false })
    precosStore.createIndex("data", "data", { unique: false })
  }

  // Cria tabela de compras se não existir
  if (!db.objectStoreNames.contains("Compras")) {
    const comprasStore = db.createObjectStore("Compras", {
      keyPath: "id",
      autoIncrement: true,
    })
    // Índice para ordenação por data
    comprasStore.createIndex("dataCompra", "dataCompra", { unique: false })
  }
}

/**
 * Evento de sucesso ao abrir o banco de dados
 * Inicializa a aplicação carregando dados
 */
request.onsuccess = (event) => {
  db = event.target.result
  console.log("[v0] ✅ Banco de dados inicializado com sucesso")

  // Carrega dados iniciais
  carregarPrecos()
  carregarHistorico()
  inicializarGrafico()
}

/**
 * Evento de erro ao abrir o banco de dados
 * Exibe mensagem de erro para o usuário
 */
request.onerror = (event) => {
  console.error("[v0] ❌ Erro ao abrir banco de dados:", event.target.error)
  mostrarErro("Erro ao inicializar o banco de dados. Recarregue a página.")
}

// ========================================
// FUNÇÕES DE PREÇOS
// ========================================

/**
 * Carrega e exibe os preços atuais do petróleo
 * Busca dados da API e atualiza a interface
 * @async
 */
async function carregarPrecos() {
  const listaPrecos = document.getElementById("lista-precos")

  try {
    // Exibe indicador de carregamento apenas na primeira vez
    if (listaPrecos.children.length === 0 || listaPrecos.querySelector(".loading")) {
      listaPrecos.innerHTML = `
        <div class="loading">
          <div class="loading-spinner"></div>
          <p>🔄 Carregando preços do mercado...</p>
        </div>
      `
    }

    // Busca dados dos preços (simulado)
    const precos = await simularDadosPrecos()

    // Limpa container apenas na primeira vez
    if (listaPrecos.querySelector(".loading")) {
      listaPrecos.innerHTML = ""

      // Cria e adiciona card para cada preço
      precos.forEach((preco) => {
        const card = criarCardPreco(preco)
        listaPrecos.appendChild(card)
      })
    } else {
      precos.forEach((preco) => {
        atualizarCardPreco(preco)
      })
    }

    // Salva preços no banco de dados
    salvarPrecosNoBanco(precos)

    atualizarTicker(precos)

    atualizarContador()

    console.log("[v0] ✅ Preços carregados com sucesso:", precos.length, "itens")
  } catch (error) {
    console.error("[v0] ❌ Erro ao carregar preços:", error)
    listaPrecos.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">❌</span>
        <span>Erro ao carregar preços</span>
        <small>Tente novamente em alguns instantes</small>
      </div>
    `
  }
}

/**
 * Atualiza um card de preço existente com animações
 * @param {Object} preco - Objeto com dados do preço
 */
function atualizarCardPreco(preco) {
  const cards = document.querySelectorAll(".price-card")

  cards.forEach((card) => {
    const simboloElement = card.querySelector(".price-symbol")
    if (!simboloElement) return

    const simboloTexto = simboloElement.textContent.trim()
    if (simboloTexto.includes(preco.simbolo)) {
      // Adiciona animação de flash
      card.classList.add("price-updating")
      setTimeout(() => card.classList.remove("price-updating"), 500)

      // Atualiza valor com animação
      const valorElement = card.querySelector(".price-value")
      const precoAnterior = precosAtuais[preco.simbolo]

      if (preco.preco > precoAnterior) {
        valorElement.classList.add("price-up")
        setTimeout(() => valorElement.classList.remove("price-up"), 500)
      } else if (preco.preco < precoAnterior) {
        valorElement.classList.add("price-down")
        setTimeout(() => valorElement.classList.remove("price-down"), 500)
      }

      valorElement.textContent = `$${preco.preco.toFixed(2)}`

      // Atualiza variação
      const variacaoElement = card.querySelector(".price-change")
      const variacaoClass = preco.variacao >= 0 ? "positive" : "negative"
      const variacaoIcon = preco.variacao >= 0 ? "📈" : "📉"

      variacaoElement.className = `price-change ${variacaoClass}`
      variacaoElement.innerHTML = `${variacaoIcon} ${preco.variacao > 0 ? "+" : ""}${preco.variacao.toFixed(2)}%`

      // Atualiza seta de tendência
      const trendArrow = card.querySelector(".trend-arrow")
      if (trendArrow) {
        trendArrow.className = `trend-arrow ${preco.variacao >= 0 ? "up" : "down"}`
        trendArrow.textContent = preco.variacao >= 0 ? "↑" : "↓"
      }

      // Atualiza sparkline
      atualizarSparkline(preco.simbolo, preco.preco)

      // Atualiza preço atual
      precosAtuais[preco.simbolo] = preco.preco
    }
  })
}

/**
 * Atualiza o ticker de mercado com novos preços
 * @param {Array} precos - Array de objetos de preços
 */
function atualizarTicker(precos) {
  const tickerPrices = document.querySelectorAll(".ticker-price")

  tickerPrices.forEach((priceElement) => {
    const simbolo = priceElement.getAttribute("data-symbol")
    const preco = precos.find((p) => p.simbolo === simbolo)

    if (preco) {
      priceElement.textContent = `$${preco.preco.toFixed(2)}`

      // Atualiza variação no ticker
      const changeElement = priceElement.parentElement.querySelector(".ticker-change")
      if (changeElement) {
        const variacaoClass = preco.variacao >= 0 ? "positive" : "negative"
        changeElement.className = `ticker-change ${variacaoClass}`
        changeElement.textContent = `${preco.variacao > 0 ? "+" : ""}${preco.variacao.toFixed(1)}%`
      }
    }
  })
}

/**
 * Atualiza o contador de última atualização
 */
function atualizarContador() {
  const contador = document.getElementById("update-counter")
  if (contador) {
    contadorAtualizacoes++
    const agora = new Date()
    const tempo = agora.toLocaleTimeString("pt-BR")
    contador.textContent = `Atualização #${contadorAtualizacoes} às ${tempo}`
  }
}

/**
 * Atualiza o mini gráfico de tendência (sparkline)
 * @param {string} simbolo - Símbolo do petróleo
 * @param {number} preco - Novo preço
 */
function atualizarSparkline(simbolo, preco) {
  // Adiciona novo preço ao histórico
  if (!historicoSparkline[simbolo]) {
    historicoSparkline[simbolo] = []
  }

  historicoSparkline[simbolo].push(preco)

  // Mantém apenas os últimos 20 valores
  if (historicoSparkline[simbolo].length > 20) {
    historicoSparkline[simbolo].shift()
  }

  // Desenha sparkline
  desenharSparkline(simbolo)
}

/**
 * Desenha o mini gráfico de tendência usando canvas
 * @param {string} simbolo - Símbolo do petróleo
 */
function desenharSparkline(simbolo) {
  const canvas = document.querySelector(`[data-sparkline="${simbolo}"]`)
  if (!canvas) return

  const ctx = canvas.getContext("2d")
  const width = canvas.width
  const height = canvas.height
  const dados = historicoSparkline[simbolo]

  if (!dados || dados.length < 2) return

  // Limpa canvas
  ctx.clearRect(0, 0, width, height)

  // Calcula escala
  const min = Math.min(...dados)
  const max = Math.max(...dados)
  const range = max - min || 1

  // Desenha linha
  ctx.beginPath()
  ctx.strokeStyle = dados[dados.length - 1] > dados[0] ? "#28a745" : "#dc3545"
  ctx.lineWidth = 2

  dados.forEach((valor, index) => {
    const x = (index / (dados.length - 1)) * width
    const y = height - ((valor - min) / range) * height

    if (index === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  })

  ctx.stroke()

  // Desenha área preenchida
  ctx.lineTo(width, height)
  ctx.lineTo(0, height)
  ctx.closePath()
  ctx.fillStyle = dados[dados.length - 1] > dados[0] ? "rgba(40, 167, 69, 0.1)" : "rgba(220, 53, 69, 0.1)"
  ctx.fill()
}

/**
 * Simula dados de preços do petróleo
 * Em produção, substituir por chamada real à API
 * @async
 * @returns {Promise<Array>} Array com objetos de preços
 */
async function simularDadosPrecos() {
  await new Promise((resolve) => setTimeout(resolve, 300))

  const simbolos = ["BRENT", "WTI", "OPEC"]

  return simbolos.map((simbolo) => {
    const precoAnterior = precosAtuais[simbolo]
    // Variação entre -0.5% e +0.5% do preço anterior
    const variacao = (Math.random() - 0.5) * 1
    const novoPreco = precoAnterior * (1 + variacao / 100)
    const variacaoPercentual = ((novoPreco - precoAnterior) / precoAnterior) * 100

    return {
      simbolo: simbolo,
      nome: simbolo === "BRENT" ? "Brent Crude Oil" : simbolo === "WTI" ? "West Texas Intermediate" : "OPEC Basket",
      preco: novoPreco,
      variacao: variacaoPercentual,
      moeda: "USD",
    }
  })
}

/**
 * Cria um card HTML para exibir um preço
 * @param {Object} preco - Objeto com dados do preço
 * @returns {HTMLElement} Elemento div com o card
 */
function criarCardPreco(preco) {
  const card = document.createElement("div")
  card.className = "price-card"

  // Define classe CSS baseada na variação (positiva ou negativa)
  const variacaoClass = preco.variacao >= 0 ? "positive" : "negative"
  const variacaoIcon = preco.variacao >= 0 ? "📈" : "📉"
  const trendArrow = preco.variacao >= 0 ? "↑" : "↓"
  const trendClass = preco.variacao >= 0 ? "up" : "down"

  // Monta HTML do card
  card.innerHTML = `
    <div class="price-symbol">
      ${preco.simbolo}
      <span class="trend-arrow ${trendClass}">${trendArrow}</span>
    </div>
    <div class="price-value">$${preco.preco.toFixed(2)}</div>
    <div class="price-change ${variacaoClass}">
      ${variacaoIcon} ${preco.variacao > 0 ? "+" : ""}${preco.variacao.toFixed(2)}%
    </div>
    <div style="font-size: 0.85rem; color: #6c757d; margin-top: 0.5rem;">
      ${preco.nome}
    </div>
    <div class="price-sparkline">
      <canvas class="sparkline-canvas" data-sparkline="${preco.simbolo}" width="200" height="40"></canvas>
    </div>
  `

  setTimeout(() => {
    historicoSparkline[preco.simbolo] = [preco.preco]
    desenharSparkline(preco.simbolo)
  }, 100)

  return card
}

// ========================================
// FUNÇÕES DO GRÁFICO 3D
// ========================================

/**
 * Inicializa o gráfico 3D usando Plotly.js
 * Cria visualização interativa com dados históricos
 */
function inicializarGrafico() {
  const container = document.getElementById("chart")

  if (!container) {
    console.error("[v0] ❌ Container do gráfico não encontrado")
    return
  }

  console.log("[v0] 📊 Inicializando gráfico 3D...")

  // Gera dados para 7 dias
  const dados = gerarDadosGrafico3D(7)

  // Configuração do trace para Brent
  const traceBrent = {
    x: dados.labels, // Datas
    y: dados.brent, // Preços
    z: dados.brentVolume, // Volume (terceira dimensão)
    mode: "lines+markers",
    type: "scatter3d",
    name: "Brent Crude",
    line: {
      color: dados.brentColors,
      width: 4,
    },
    marker: {
      size: 6,
      color: dados.brentColors,
      colorscale: [
        [0, "#dc3545"], // Vermelho para baixa
        [0.5, "#ffc107"], // Amarelo neutro
        [1, "#28a745"], // Verde para alta
      ],
      showscale: true,
      colorbar: {
        title: "Variação %",
        x: 1.1,
      },
    },
  }

  // Configuração do trace para WTI
  const traceWTI = {
    x: dados.labels,
    y: dados.wti,
    z: dados.wtiVolume,
    mode: "lines+markers",
    type: "scatter3d",
    name: "WTI",
    line: {
      color: dados.wtiColors,
      width: 4,
    },
    marker: {
      size: 6,
      color: dados.wtiColors,
      colorscale: [
        [0, "#dc3545"],
        [0.5, "#ffc107"],
        [1, "#28a745"],
      ],
    },
  }

  // Layout do gráfico
  const layout = {
    title: {
      text: "Análise 3D de Preços do Petróleo",
      font: { size: 18, color: "#2c2c2c", family: "Segoe UI" },
    },
    scene: {
      xaxis: {
        title: "Data",
        titlefont: { color: "#556B2F" },
        gridcolor: "#e0e0e0",
      },
      yaxis: {
        title: "Preço (USD)",
        titlefont: { color: "#556B2F" },
        gridcolor: "#e0e0e0",
      },
      zaxis: {
        title: "Volume Relativo",
        titlefont: { color: "#556B2F" },
        gridcolor: "#e0e0e0",
      },
      camera: {
        eye: { x: 1.5, y: 1.5, z: 1.3 }, // Posição da câmera
      },
      bgcolor: "#f8f9fa",
    },
    paper_bgcolor: "rgba(255,255,255,0.95)",
    plot_bgcolor: "#f8f9fa",
    showlegend: true,
    legend: {
      x: 0,
      y: 1,
      bgcolor: "rgba(255,255,255,0.8)",
      bordercolor: "#ffd700",
      borderwidth: 2,
    },
    margin: { l: 0, r: 0, t: 40, b: 0 },
    autosize: true,
  }

  // Configuração de interatividade
  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["pan3d", "select3d", "lasso3d"],
  }

  // Cria o gráfico
  Plotly.newPlot(container, [traceBrent, traceWTI], layout, config)
  chartInstance = container

  console.log("[v0] ✅ Gráfico 3D inicializado com sucesso")
}

/**
 * Gera dados simulados para o gráfico 3D
 * Cria séries temporais com variações realistas
 * @param {number} dias - Número de dias para gerar
 * @returns {Object} Objeto com arrays de dados
 */
function gerarDadosGrafico3D(dias = 7) {
  const labels = []
  const brent = []
  const wti = []
  const brentVolume = []
  const wtiVolume = []
  const brentColors = []
  const wtiColors = []

  // Preços iniciais
  let precoBrentAnterior = 85
  let precoWTIAnterior = 82

  // Gera dados para cada dia
  for (let i = dias - 1; i >= 0; i--) {
    const data = new Date()
    data.setDate(data.getDate() - i)
    labels.push(data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }))

    // Variações aleatórias realistas
    const variacaoBrent = (Math.random() - 0.5) * 3
    const variacaoWTI = (Math.random() - 0.5) * 3

    // Calcula novos preços
    const precoBrent = precoBrentAnterior + variacaoBrent
    const precoWTI = precoWTIAnterior + variacaoWTI

    brent.push(precoBrent)
    wti.push(precoWTI)

    // Volume proporcional à variação
    brentVolume.push(Math.abs(variacaoBrent) * 10 + Math.random() * 5)
    wtiVolume.push(Math.abs(variacaoWTI) * 10 + Math.random() * 5)

    // Cores baseadas na variação (normalizado entre -1 e 1)
    brentColors.push(variacaoBrent >= 0 ? variacaoBrent / 3 : variacaoBrent / 3)
    wtiColors.push(variacaoWTI >= 0 ? variacaoWTI / 3 : variacaoWTI / 3)

    // Atualiza preços anteriores
    precoBrentAnterior = precoBrent
    precoWTIAnterior = precoWTI
  }

  return { labels, brent, wti, brentVolume, wtiVolume, brentColors, wtiColors }
}

/**
 * Atualiza o gráfico 3D com novo período de tempo
 * @param {number} dias - Número de dias para exibir
 */
function atualizarGrafico(dias) {
  if (!chartInstance) {
    console.error("[v0] ❌ Instância do gráfico não encontrada")
    return
  }

  console.log("[v0] 🔄 Atualizando gráfico 3D para", dias, "dias")

  // Gera novos dados
  const dados = gerarDadosGrafico3D(dias)

  // Atualiza traces
  const traceBrent = {
    x: dados.labels,
    y: dados.brent,
    z: dados.brentVolume,
    marker: { color: dados.brentColors },
    line: { color: dados.brentColors },
  }

  const traceWTI = {
    x: dados.labels,
    y: dados.wti,
    z: dados.wtiVolume,
    marker: { color: dados.wtiColors },
    line: { color: dados.wtiColors },
  }

  // Atualiza gráfico mantendo layout
  Plotly.react(chartInstance, [traceBrent, traceWTI])

  console.log("[v0] ✅ Gráfico 3D atualizado com sucesso")
}

// ========================================
// FUNÇÕES DE COMPRA
// ========================================

/**
 * Event listener para o formulário de compra
 * Processa e valida a compra de petróleo
 */
document.getElementById("form-compra").addEventListener("submit", async (event) => {
  event.preventDefault()

  // Obtém valores do formulário
  const simbolo = document.getElementById("simbolo").value.trim().toUpperCase()
  const quantidade = Number.parseInt(document.getElementById("quantidade").value)

  // Validação básica
  if (!simbolo || quantidade <= 0) {
    mostrarErro("Por favor, preencha todos os campos corretamente")
    return
  }

  console.log("[v0] 🛒 Processando compra:", simbolo, quantidade, "barris")

  try {
    // Obtém preço atual do símbolo
    const precoAtual = await obterPrecoAtual(simbolo)
    const valorTotal = precoAtual * quantidade

    // Cria objeto de compra
    const compra = {
      simbolo: simbolo,
      quantidade: quantidade,
      precoCompra: precoAtual,
      valorTotal: valorTotal,
      dataCompra: new Date().toISOString(),
    }

    // Salva compra no banco
    salvarCompra(compra)

    // Gera sugestão da IA
    await gerarSugestaoIA(simbolo, quantidade, precoAtual)

    // Limpa formulário
    event.target.reset()

    // Atualiza histórico
    carregarHistorico()

    // Exibe mensagem de sucesso
    mostrarSucesso(`✅ Compra de ${quantidade} barris de ${simbolo} realizada com sucesso!`)

    console.log("[v0] ✅ Compra processada com sucesso:", compra)
  } catch (error) {
    console.error("[v0] ❌ Erro ao processar compra:", error)
    mostrarErro("Erro ao processar a compra. Tente novamente.")
  }
})

/**
 * Obtém o preço atual de um símbolo
 * Em produção, buscar de API real
 * @async
 * @param {string} simbolo - Símbolo do petróleo (BRENT, WTI, etc)
 * @returns {Promise<number>} Preço atual
 */
async function obterPrecoAtual(simbolo) {
  // Simula delay de API
  await new Promise((resolve) => setTimeout(resolve, 500))

  // Preços simulados
  const precos = {
    BRENT: 85.5 + (Math.random() - 0.5) * 2,
    WTI: 82.75 + (Math.random() - 0.5) * 2,
    OPEC: 84.2 + (Math.random() - 0.5) * 2,
  }

  return precos[simbolo] || 80.0
}

/**
 * Salva uma compra no banco de dados
 * @param {Object} compra - Objeto com dados da compra
 */
function salvarCompra(compra) {
  const transaction = db.transaction(["Compras"], "readwrite")
  const store = transaction.objectStore("Compras")
  const request = store.add(compra)

  request.onsuccess = () => {
    console.log("[v0] 💾 Compra salva com sucesso:", compra)
  }

  request.onerror = () => {
    console.error("[v0] ❌ Erro ao salvar compra")
  }
}

// ========================================
// FUNÇÕES DA IA
// ========================================

/**
 * Gera sugestão inteligente baseada na compra
 * Usa IA para análise de mercado (simulado)
 * @async
 * @param {string} simbolo - Símbolo do petróleo
 * @param {number} quantidade - Quantidade comprada
 * @param {number} preco - Preço de compra
 */
async function gerarSugestaoIA(simbolo, quantidade, preco) {
  const sugestaoDiv = document.getElementById("sugestao-ia")

  // Exibe indicador de carregamento
  sugestaoDiv.innerHTML = `
    <div style="text-align: center;">
      <strong>🤖 IA Analisando...</strong>
      <p style="margin-top: 0.5rem; color: #6c757d;">Gerando sugestão personalizada baseada em dados de mercado</p>
    </div>
  `

  try {
    // Gera sugestão (simulado)
    const sugestao = await simularRespostaIA(simbolo, quantidade, preco)

    // Exibe sugestão
    sugestaoDiv.innerHTML = `
      <div>
        <strong style="color: #2196f3; font-size: 1.1rem;">💡 Sugestão da IA:</strong>
        <p style="margin-top: 1rem; line-height: 1.8; color: #2c2c2c;">${sugestao}</p>
        <small style="color: #6c757d; margin-top: 1rem; display: block; font-style: italic;">
          📅 Gerado em ${new Date().toLocaleString("pt-BR")}
        </small>
      </div>
    `

    console.log("[v0] 🤖 Sugestão da IA gerada com sucesso")
  } catch (error) {
    console.error("[v0] ❌ Erro ao gerar sugestão da IA:", error)
    sugestaoDiv.innerHTML = `
      <div style="color: #dc3545;">
        <strong>⚠️ Erro ao gerar sugestão</strong>
        <p style="margin-top: 0.5rem;">Não foi possível conectar ao serviço de IA. Tente novamente mais tarde.</p>
      </div>
    `
  }
}

/**
 * Simula resposta de IA com análise de mercado
 * Em produção, integrar com API real (OpenAI, etc)
 * @async
 * @param {string} simbolo - Símbolo do petróleo
 * @param {number} quantidade - Quantidade comprada
 * @param {number} preco - Preço de compra
 * @returns {Promise<string>} Texto da sugestão
 */
async function simularRespostaIA(simbolo, quantidade, preco) {
  // Simula delay de processamento da IA
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const valorTotal = quantidade * preco
  const tendencia = Math.random() > 0.5 ? "alta" : "baixa"
  const confianca = Math.floor(Math.random() * 20) + 70 // 70-90%

  // Gera texto personalizado
  return `Baseado na análise de mercado com ${confianca}% de confiança, sua compra de ${quantidade} barris de ${simbolo} por $${preco.toFixed(2)} (total: $${valorTotal.toFixed(2)}) está em um momento ${tendencia === "alta" ? "favorável" : "de atenção"}. A tendência atual indica ${tendencia} nos próximos 7-14 dias. Recomendamos ${tendencia === "alta" ? "manter a posição e considerar aumentar" : "monitorar de perto e considerar diversificar"} seu portfólio. ${tendencia === "alta" ? "📈 Perspectiva positiva para ganhos." : "📊 Mantenha-se atento às flutuações."}`
}

// ========================================
// FUNÇÕES DE HISTÓRICO
// ========================================

/**
 * Carrega e exibe o histórico de compras
 * Busca dados do IndexedDB e renderiza na interface
 */
function carregarHistorico() {
  const listaHistorico = document.getElementById("lista-historico")
  const transaction = db.transaction(["Compras"], "readonly")
  const store = transaction.objectStore("Compras")
  const request = store.getAll()

  request.onsuccess = () => {
    const compras = request.result

    // Se não há compras, exibe estado vazio
    if (compras.length === 0) {
      listaHistorico.innerHTML = `
        <p class="empty-state">
          <span class="empty-icon">📦</span>
          <span>Nenhuma compra realizada ainda</span>
          <small>Suas transações aparecerão aqui</small>
        </p>
      `
      return
    }

    // Limpa container
    listaHistorico.innerHTML = ""

    // Ordena por data (mais recente primeiro)
    compras.sort((a, b) => new Date(b.dataCompra) - new Date(a.dataCompra))

    // Cria item para cada compra
    compras.forEach((compra) => {
      const item = criarItemHistorico(compra)
      listaHistorico.appendChild(item)
    })

    console.log("[v0] 📋 Histórico carregado:", compras.length, "compras")
  }

  request.onerror = () => {
    console.error("[v0] ❌ Erro ao carregar histórico")
  }
}

/**
 * Cria elemento HTML para um item do histórico
 * @param {Object} compra - Objeto com dados da compra
 * @returns {HTMLElement} Elemento div com o item
 */
function criarItemHistorico(compra) {
  const item = document.createElement("div")
  item.className = "history-item"

  // Formata data
  const data = new Date(compra.dataCompra)
  const dataFormatada = data.toLocaleString("pt-BR")

  // Monta HTML do item
  item.innerHTML = `
    <div>
      <strong style="color: #556B2F;">Símbolo:</strong><br>
      <span style="font-size: 1.1rem; font-weight: 700;">${compra.simbolo}</span>
    </div>
    <div>
      <strong style="color: #556B2F;">Quantidade:</strong><br>
      ${compra.quantidade} barris
    </div>
    <div>
      <strong style="color: #556B2F;">Preço Unitário:</strong><br>
      $${compra.precoCompra.toFixed(2)}
    </div>
    <div>
      <strong style="color: #556B2F;">Valor Total:</strong><br>
      <span style="color: #556B2F; font-weight: 800; font-size: 1.2rem;">
        $${compra.valorTotal.toFixed(2)}
      </span>
    </div>
    <div>
      <strong style="color: #556B2F;">Data:</strong><br>
      ${dataFormatada}
    </div>
  `

  return item
}

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

/**
 * Exibe mensagem de erro para o usuário
 * @param {string} mensagem - Texto da mensagem
 */
function mostrarErro(mensagem) {
  alert("❌ " + mensagem)
}

/**
 * Exibe mensagem de sucesso para o usuário
 * @param {string} mensagem - Texto da mensagem
 */
function mostrarSucesso(mensagem) {
  alert("✅ " + mensagem)
}

// ========================================
// EVENTOS E LISTENERS
// ========================================

/**
 * Event listener para mudança no seletor de período do gráfico
 * Atualiza o gráfico com o novo período selecionado
 */
document.getElementById("periodo-grafico")?.addEventListener("change", (event) => {
  const periodo = Number.parseInt(event.target.value)
  console.log("[v0] 📊 Período do gráfico alterado para:", periodo, "dias")
  atualizarGrafico(periodo)
})

/**
 * Atualização automática de preços em tempo real
 * Simula comportamento de bolsa de valores
 */
setInterval(() => {
  console.log("[v0] 🔄 Atualizando preços em tempo real...")
  carregarPrecos()
}, INTERVALO_ATUALIZACAO)

// Log de inicialização
console.log("[v0] 🚀 Script carregado e pronto!")
console.log("[v0] 📱 Dashboard PetraGlobal Energy inicializado")
console.log("[v0] ⚡ Sistema de tempo real ativado - Atualizações a cada", INTERVALO_ATUALIZACAO / 1000, "segundos")

// Declaração da função salvarPrecosNoBanco
function salvarPrecosNoBanco(precos) {
  const transaction = db.transaction(["PrecosHistoricos"], "readwrite")
  const store = transaction.objectStore("PrecosHistoricos")

  precos.forEach((preco) => {
    const request = store.add(preco)

    request.onsuccess = () => {
      console.log("[v0] 💾 Preço salvo com sucesso:", preco)
    }

    request.onerror = () => {
      console.error("[v0] ❌ Erro ao salvar preço")
    }
  })
}
