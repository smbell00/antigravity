// main application script

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const networkContainer = document.getElementById("network-graph");
  const emptyState = document.getElementById("empty-state");
  const loadingState = document.getElementById("loading-state");
  const renderedContent = document.getElementById("rendered-content");
  const viewerControls = document.getElementById("viewer-controls");
  const btnRawMd = document.getElementById("btn-raw-md");
  const searchInput = document.getElementById("node-search");
  const filterCheckboxes = document.querySelectorAll(".filter-chip input");
  const corsWarning = document.getElementById("cors-warning");
  const btnCloseWarning = document.getElementById("btn-close-warning");
  const btnFit = document.getElementById("btn-fit");
  const btnStabilize = document.getElementById("btn-stabilize");

  // Global variables
  let network = null;
  let nodesDataSet = null;
  let edgesDataSet = null;
  let rawNodes = [];
  let rawEdges = [];
  let isCorsWarningTriggered = false;
  let physicsLocked = false;
  let activeSelectedNodeId = null;

  // Initialize network data arrays
  function prepareGraphData() {
    rawNodes = [];
    rawEdges = [];

    // Get active filter categories
    const activeFilters = Array.from(filterCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    // Track active keywords to filter out unused keywords
    const usedKeywords = new Set();

    // 1. Add Agent Nodes
    AGENTS_DATA.forEach(agent => {
      // Check if agent category or ownership matches current filters
      const matchCategory = activeFilters.includes(agent.category);
      const matchOwnership = 
        (activeFilters.includes("상용서비스") && agent.keywords.includes("상용서비스")) ||
        (activeFilters.includes("오픈소스") && agent.keywords.includes("오픈소스"));

      // Include if it matches category filters OR ownership filters
      if (matchCategory || matchOwnership) {
        rawNodes.push({
          id: agent.id,
          label: agent.label,
          group: "agents",
          title: agent.summary,
          type: "agent",
          // Styling details
          color: {
            background: "#3b82f6",
            border: "#1d4ed8",
            highlight: { background: "#60a5fa", border: "#3b82f6" },
            hover: { background: "#60a5fa", border: "#3b82f6" }
          },
          shadow: { enabled: true, color: "rgba(59, 130, 246, 0.4)", size: 12 },
          font: { size: 14, color: "#f8fafc", face: "Outfit" },
          size: 26
        });

        // Track keywords this agent uses
        agent.keywords.forEach(kw => usedKeywords.add(kw));
      }
    });

    // 2. Add Keyword Nodes
    usedKeywords.forEach(kw => {
      rawNodes.push({
        id: `kw_${kw}`,
        label: `#${kw}`,
        group: "keywords",
        title: KEYWORDS_INFO[kw] || `${kw} 관련 문서들`,
        type: "keyword",
        keywordValue: kw,
        // Styling details
        color: {
          background: "#d946ef",
          border: "#a21caf",
          highlight: { background: "#f472b6", border: "#d946ef" },
          hover: { background: "#f472b6", border: "#d946ef" }
        },
        shadow: { enabled: true, color: "rgba(217, 70, 239, 0.4)", size: 10 },
        font: { size: 11, color: "#cbd5e1", face: "Outfit" },
        size: 15
      });
    });

    // 3. Add Edges connecting Agents and Keywords
    AGENTS_DATA.forEach(agent => {
      // Only draw edges for visible agents
      const agentIsVisible = rawNodes.some(n => n.id === agent.id);
      if (!agentIsVisible) return;

      agent.keywords.forEach(kw => {
        rawEdges.push({
          id: `edge_${agent.id}_${kw}`,
          from: agent.id,
          to: `kw_${kw}`,
          color: {
            color: "rgba(71, 85, 105, 0.4)",
            highlight: "rgba(6, 182, 212, 0.8)",
            hover: "rgba(6, 182, 212, 0.6)"
          },
          width: 1.5,
          length: 120
        });
      });
    });
  }

  // Draw the Network Graph using Vis.js
  function drawGraph() {
    prepareGraphData();

    nodesDataSet = new vis.DataSet(rawNodes);
    edgesDataSet = new vis.DataSet(rawEdges);

    const data = {
      nodes: nodesDataSet,
      edges: edgesDataSet
    };

    const options = {
      nodes: {
        shape: "dot",
        borderWidth: 2,
        scaling: { min: 10, max: 30 }
      },
      edges: {
        smooth: {
          type: "continuous",
          forceDirection: "none"
        }
      },
      physics: {
        barnesHut: {
          gravitationalConstant: -1800,
          centralGravity: 0.3,
          springLength: 95,
          springConstant: 0.04,
          damping: 0.09,
          avoidOverlap: 0.15
        },
        stabilization: {
          iterations: 150,
          updateInterval: 25
        }
      },
      interaction: {
        hover: true,
        hoverConnectedEdges: false, // Handle this manually for custom opacity fade effect
        selectConnectedEdges: false,
        tooltipDelay: 150,
        dragNodes: true,
        zoomView: true,
        dragView: true
      }
    };

    network = new vis.Network(networkContainer, data, options);

    // Setup Event Listeners on the network
    setupNetworkEvents();
  }

  // Network Event Listeners (Hover and Clicks)
  function setupNetworkEvents() {
    // 1. Hover Effect (Highlight neighbors, fade others)
    network.on("hoverNode", function (params) {
      const hoveredId = params.node;
      
      // Get all connected nodes and edges
      const connectedNodes = network.getConnectedNodes(hoveredId);
      const connectedEdges = network.getConnectedEdges(hoveredId);
      
      // Track items to keep highlighted
      const highlightedNodes = new Set(connectedNodes);
      highlightedNodes.add(hoveredId);
      
      const highlightedEdges = new Set(connectedEdges);

      // Create updates for all nodes
      const nodeUpdates = rawNodes.map(node => {
        const isHighlighted = highlightedNodes.has(node.id);
        
        let opacity = isHighlighted ? 1.0 : 0.15;
        let baseColor = node.type === "agent" ? "#3b82f6" : "#d946ef";
        let borderColor = node.type === "agent" ? "#1d4ed8" : "#a21caf";
        
        if (node.id === hoveredId) {
          // Highlight hover node
          baseColor = node.type === "agent" ? "#60a5fa" : "#f472b6";
        }

        return {
          id: node.id,
          color: {
            background: convertHexToRgba(baseColor, opacity),
            border: convertHexToRgba(borderColor, opacity)
          },
          font: {
            color: convertHexToRgba(node.font.color, opacity)
          }
        };
      });

      // Create updates for all edges
      const edgeUpdates = rawEdges.map(edge => {
        const isHighlighted = highlightedEdges.has(edge.id);
        const opacity = isHighlighted ? 0.9 : 0.05;
        const color = isHighlighted ? "rgba(6, 182, 212, 0.9)" : "rgba(71, 85, 105, 0.05)";
        
        return {
          id: edge.id,
          color: {
            color: color
          },
          width: isHighlighted ? 3 : 1.5
        };
      });

      nodesDataSet.update(nodeUpdates);
      edgesDataSet.update(edgeUpdates);
    });

    // Reset Hover styles on blur
    network.on("blurNode", function (params) {
      const nodeUpdates = rawNodes.map(node => {
        return {
          id: node.id,
          color: node.color,
          font: node.font
        };
      });

      const edgeUpdates = rawEdges.map(edge => {
        return {
          id: edge.id,
          color: edge.color,
          width: edge.width
        };
      });

      nodesDataSet.update(nodeUpdates);
      edgesDataSet.update(edgeUpdates);
    });

    // 2. Click Node Handler
    network.on("click", function (params) {
      if (params.nodes.length > 0) {
        const clickedId = params.nodes[0];
        handleNodeClick(clickedId);
      }
    });
  }

  // Handle Graph Node Clicks
  function handleNodeClick(nodeId) {
    activeSelectedNodeId = nodeId;
    
    // Find node details in datasets
    const clickedNode = nodesDataSet.get(nodeId);
    if (!clickedNode) return;

    if (clickedNode.type === "agent") {
      // Find the agent details from metadata
      const agent = AGENTS_DATA.find(a => a.id === nodeId);
      if (agent) {
        loadManual(agent);
      }
    } else if (clickedNode.type === "keyword") {
      const kw = clickedNode.keywordValue;
      loadKeywordInfo(kw);
    }
  }

  // Fetch and Render Markdown Manual
  function loadManual(agent) {
    // UI state transitions
    emptyState.classList.add("hidden");
    renderedContent.classList.add("hidden");
    loadingState.classList.remove("hidden");
    viewerControls.classList.add("hidden");

    // Fetch the actual markdown file
    fetch(agent.filePath)
      .then(res => {
        if (!res.ok) {
          throw new Error("파일 읽기 실패");
        }
        return res.text();
      })
      .then(markdownText => {
        renderDocument(agent, markdownText);
      })
      .catch(err => {
        console.warn(`[CORS/Fetch] Local fetch failed for ${agent.filePath}, using embedded fallback markdown. Error:`, err);
        
        // Trigger CORS alert if not already acknowledged
        if (window.location.protocol === "file:" && !isCorsWarningTriggered) {
          corsWarning.classList.remove("hidden");
          isCorsWarningTriggered = true;
        }

        // Render fallback markdown directly
        renderDocument(agent, agent.markdown);
      });
  }

  // Render Document Contents
  function renderDocument(agent, markdownText) {
    // Parse Markdown using marked.js
    const htmlContent = marked.parse(markdownText);

    // Build Premium Meta Card
    const metaHtml = `
      <div class="agent-meta-header">
        <div class="meta-row">
          <span class="meta-label"><i class="fa-solid fa-layer-group"></i> 카테고리:</span>
          <span class="meta-value">${agent.category}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label"><i class="fa-solid fa-file-invoice"></i> 로컬 경로:</span>
          <span class="meta-value"><code>${agent.filePath}</code></span>
        </div>
        <div class="meta-row" style="margin-top: 0.25rem;">
          <span class="meta-label"><i class="fa-solid fa-tags"></i> 키워드 태그:</span>
          <div class="tag-list">
            ${agent.keywords.map(kw => `<span class="tag-badge" data-keyword="${kw}"><i class="fa-solid fa-hashtag"></i> ${kw}</span>`).join("")}
          </div>
        </div>
      </div>
    `;

    // Inject into document container
    renderedContent.innerHTML = metaHtml + htmlContent;

    // Attach click listeners to keyword tags in metadata card
    renderedContent.querySelectorAll(".tag-badge").forEach(badge => {
      badge.addEventListener("click", (e) => {
        const kw = e.currentTarget.getAttribute("data-keyword");
        highlightKeyword(kw);
      });
    });

    // Syntax Highlight with Prism
    Prism.highlightAllUnder(renderedContent);

    // Show contents
    loadingState.classList.add("hidden");
    renderedContent.classList.remove("hidden");
    viewerControls.classList.remove("hidden");

    // Configure Raw MD link
    btnRawMd.onclick = () => {
      window.open(agent.filePath, "_blank");
    };
  }

  // Render Keyword Info Panel
  function loadKeywordInfo(kw) {
    emptyState.classList.add("hidden");
    loadingState.classList.add("hidden");
    renderedContent.classList.remove("hidden");
    viewerControls.classList.add("hidden");

    const description = KEYWORDS_INFO[kw] || "설명이 아직 추가되지 않은 키워드입니다.";
    
    // Find all agents that share this keyword
    const relatedAgents = AGENTS_DATA.filter(a => a.keywords.includes(kw));
    const relatedHtml = relatedAgents.map(a => `
      <div class="filter-chip" style="padding: 0.5rem 1rem; font-size: 0.85rem; background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.35); cursor: pointer;" onclick="document.getElementById('rendered-content').clickNodeById('${a.id}')">
        <span style="color: #60a5fa; font-weight: 500;"><i class="fa-solid fa-robot"></i> ${a.label}</span>
      </div>
    `).join("");

    renderedContent.innerHTML = `
      <div class="rendered-markdown" style="animation: fadeIn 0.4s ease-out;">
        <h1 style="border-bottom-color: rgba(217, 70, 239, 0.3); background: linear-gradient(to right, #f472b6, #d946ef); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">#${kw} 키워드 분석</h1>
        
        <div class="agent-meta-header" style="background: rgba(217, 70, 239, 0.04); border-color: rgba(217, 70, 239, 0.2);">
          <p style="margin: 0; color: #f5f5f5; font-size: 0.95rem; line-height: 1.6;">${description}</p>
        </div>

        <h2 style="border-left-color: var(--accent-magenta);">이 키워드를 연결 중인 AI 에이전트 목록</h2>
        <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 1.25rem;">해당 키워드를 공유하는 에이전트들입니다. (네트워크 맵 상에서도 연결이 표시됩니다)</p>
        
        <div class="tag-list" style="gap: 0.75rem; margin-top: 1rem;">
          ${relatedHtml}
        </div>
      </div>
    `;

    // Highlight all related agents in the graph
    highlightKeyword(kw);
  }

  // Click handler to activate node programmatically
  renderedContent.clickNodeById = function(nodeId) {
    if (network) {
      network.selectNodes([nodeId]);
      handleNodeClick(nodeId);
      // Zoom and center
      network.focus(nodeId, {
        scale: 1.2,
        animation: {
          duration: 600,
          easingFunction: "easeInOutQuad"
        }
      });
    }
  };

  // Highlight all nodes connected to a keyword
  function highlightKeyword(kw) {
    if (!network || !nodesDataSet) return;

    const keywordNodeId = `kw_${kw}`;
    const connectedNodeIds = network.getConnectedNodes(keywordNodeId);
    
    const highlightSet = new Set(connectedNodeIds);
    highlightSet.add(keywordNodeId);

    // Apply color highlights to network dataset
    const nodeUpdates = rawNodes.map(node => {
      const isHighlighted = highlightSet.has(node.id);
      const opacity = isHighlighted ? 1.0 : 0.15;
      
      return {
        id: node.id,
        color: {
          background: convertHexToRgba(node.color.background, opacity),
          border: convertHexToRgba(node.color.border, opacity)
        },
        font: {
          color: convertHexToRgba(node.font.color, opacity)
        }
      };
    });

    const edgeUpdates = rawEdges.map(edge => {
      const isConnected = edge.to === keywordNodeId || edge.from === keywordNodeId;
      const opacity = isConnected ? 0.9 : 0.05;
      const color = isConnected ? "rgba(217, 70, 239, 0.9)" : "rgba(71, 85, 105, 0.05)";
      
      return {
        id: edge.id,
        color: { color: color },
        width: isConnected ? 3.5 : 1.5
      };
    });

    nodesDataSet.update(nodeUpdates);
    edgesDataSet.update(edgeUpdates);

    // Focus camera on the keyword node
    network.focus(keywordNodeId, {
      scale: 1.1,
      animation: {
        duration: 500,
        easingFunction: "easeInOutQuad"
      }
    });
  }

  // Filter Checkbox Listeners
  filterCheckboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      // Re-draw graph to filter out filtered elements
      drawGraph();
      
      // If the selected node is filtered out, clear viewer
      if (activeSelectedNodeId) {
        const nodeExists = nodesDataSet.get(activeSelectedNodeId);
        if (!nodeExists) {
          resetViewer();
        }
      }
    });
  });

  // Search Input Node Highlights
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      // Reset styles to default
      drawGraph();
      return;
    }

    // Find nodes matching query
    const matchedNode = rawNodes.find(n => n.label.toLowerCase().includes(query) || (n.id.replace("kw_", "").toLowerCase().includes(query)));
    
    if (matchedNode) {
      // Focus network camera on matching node
      network.focus(matchedNode.id, {
        scale: 1.3,
        animation: {
          duration: 400,
          easingFunction: "easeInOutQuad"
        }
      });
      network.selectNodes([matchedNode.id]);
    }
  });

  // Zoom & Physics UI Buttons
  btnFit.addEventListener("click", () => {
    if (network) {
      network.fit({
        animation: {
          duration: 600,
          easingFunction: "easeOutQuad"
        }
      });
    }
  });

  btnStabilize.addEventListener("click", () => {
    if (!network) return;
    
    physicsLocked = !physicsLocked;
    
    if (physicsLocked) {
      network.setOptions({ physics: { enabled: false } });
      btnStabilize.innerHTML = '<i class="fa-solid fa-unlock"></i>';
      btnStabilize.title = "물리 엔진 활성화";
      btnStabilize.style.background = "var(--accent-purple)";
      btnStabilize.style.borderColor = "var(--accent-purple)";
    } else {
      network.setOptions({ physics: { enabled: true } });
      btnStabilize.innerHTML = '<i class="fa-solid fa-lock"></i>';
      btnStabilize.title = "물리 엔진 고정";
      btnStabilize.style.background = "";
      btnStabilize.style.borderColor = "";
      // Re-stabilize
      network.stabilize();
    }
  });

  // CORS warning close button
  btnCloseWarning.addEventListener("click", () => {
    corsWarning.classList.add("hidden");
  });

  // Reset Viewer back to Empty State
  function resetViewer() {
    activeSelectedNodeId = null;
    emptyState.classList.remove("hidden");
    renderedContent.classList.add("hidden");
    loadingState.classList.add("hidden");
    viewerControls.classList.add("hidden");
  }

  // Utility function: Convert hex color strings to RGBA
  function convertHexToRgba(hex, opacity) {
    if (!hex) return "";
    if (hex.startsWith("rgba")) return hex; // already RGBA
    
    // Expand shorthand hex (e.g. "#03F") to full form
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    return result 
      ? `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${opacity})`
      : hex;
  }

  // Initial draw
  drawGraph();
});
