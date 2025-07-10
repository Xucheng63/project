// utils/latexRenderer.js
/**
 * Process text to render LaTeX expressions
 * @param {string} text - Text potentially containing LaTeX expressions
 * @returns {string} - HTML-ready text with LaTeX expressions prepared for rendering
 */
export const renderLatexInText = (text) => {
  if (!text || typeof text !== 'string') return text;

  // Process inline LaTeX: \( ... \)
  let processedText = text.replace(/\\\((.*?)\\\)/g, (match, latexContent) => {
    return `<span class="latex-inline">${match}</span>`;
  });

  // Process display LaTeX: \[ ... \]
  processedText = processedText.replace(/\\\[(.*?)\\\]/g, (match, latexContent) => {
    return `<div class="latex-display">${match}</div>`;
  });

  // Process equation environment: \begin{equation} ... \end{equation}
  processedText = processedText.replace(/\\begin\{equation\}(.*?)\\end\{equation\}/gs, (match, latexContent) => {
    return `<div class="latex-equation">${match}</div>`;
  });

  // Process other LaTeX environments if needed
  // ...

  return processedText;
};

/**
 * Check if MathJax is loaded and load it if not
 * @returns {Promise} - Resolves when MathJax is ready
 */
export const ensureMathJaxLoaded = () => {
  return new Promise((resolve, reject) => {
    if (window.MathJax) {
      resolve();
      return;
    }

    // Create script element to load MathJax
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
    script.async = true;
    
    script.onload = () => {
      // Configure MathJax
      window.MathJax = {
        tex: {
          inlineMath: [['\\(', '\\)']],
          displayMath: [['\\[', '\\]']],
          processEnvironments: true,
          processRefs: true
        },
        options: {
          skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
          processHtmlClass: 'latex-content'
        }
      };
      
      // Resolve when MathJax is ready
      if (window.MathJax.startup) {
        window.MathJax.startup.promise.then(resolve);
      } else {
        resolve();
      }
    };
    
    script.onerror = () => {
      reject(new Error('Failed to load MathJax'));
    };
    
    document.head.appendChild(script);
  });
};