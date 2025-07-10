// 优化LatexRenderer.jsx
import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const LatexRenderer = ({ content, displayMode = false }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !content) return;

    // 正则表达式匹配LaTeX公式
    const inlineLatexRegex = /(\\\(.*?\\\)|\$(?!\$).*?(?<!\$)\$)/gs; // 内联公式
    const blockLatexRegex = /(\\\[.*?\\\]|\$\$.*?\$\$)/gs;  // 块级公式
    
    // 先处理块级公式，避免与内联公式混淆
    let processedContent = content;
    let blockParts = [];
    let blockMatches = [...processedContent.matchAll(blockLatexRegex)];
    
    // 替换块级公式为占位符
    if (blockMatches.length > 0) {
      blockMatches.forEach((match, index) => {
        blockParts.push(match[0]);
        processedContent = processedContent.replace(match[0], `__BLOCK_LATEX_${index}__`);
      });
    }
    
    // 然后处理内联公式
    let inlineParts = [];
    let inlineMatches = [...processedContent.matchAll(inlineLatexRegex)];
    
    // 替换内联公式为占位符
    if (inlineMatches.length > 0) {
      inlineMatches.forEach((match, index) => {
        inlineParts.push(match[0]);
        processedContent = processedContent.replace(match[0], `__INLINE_LATEX_${index}__`);
      });
    }
    
    // 清空容器
    containerRef.current.innerHTML = '';
    
    // 分段处理内容
    const textParts = processedContent.split(/(__BLOCK_LATEX_\d+__|__INLINE_LATEX_\d+__)/g);
    
    textParts.forEach(part => {
      if (part.startsWith('__BLOCK_LATEX_')) {
        // 块级公式
        const index = parseInt(part.match(/__BLOCK_LATEX_(\d+)__/)[1]);
        const formula = blockParts[index];
        
        if (formula.startsWith('\\[') && formula.endsWith('\\]')) {
          renderLatex(formula.substring(2, formula.length - 2), true);
        } else if (formula.startsWith('$$') && formula.endsWith('$$')) {
          renderLatex(formula.substring(2, formula.length - 2), true);
        }
      } else if (part.startsWith('__INLINE_LATEX_')) {
        // 内联公式
        const index = parseInt(part.match(/__INLINE_LATEX_(\d+)__/)[1]);
        const formula = inlineParts[index];
        
        if (formula.startsWith('\\(') && formula.endsWith('\\)')) {
          renderLatex(formula.substring(2, formula.length - 2), false);
        } else if (formula.startsWith('$') && formula.endsWith('$')) {
          renderLatex(formula.substring(1, formula.length - 1), false);
        }
      } else if (part.trim().length > 0) {
        // 普通文本
        const textNode = document.createElement('span');
        textNode.className = 'latex-text';
        textNode.innerHTML = part;
        containerRef.current.appendChild(textNode);
      }
    });
    
    function renderLatex(formula, isBlockMode) {
      try {
        // 创建元素来渲染LaTeX
        const el = document.createElement(isBlockMode ? 'div' : 'span');
        el.className = isBlockMode ? 'latex-block' : 'latex-inline';
        
        // 特别处理分数格式，确保正确渲染
        let processedFormula = formula;
        
        // 检查是否包含常见的需要特殊处理的数学结构
        const hasFrac = /\\frac{.*?}{.*?}/g.test(formula);
        const hasSuperscript = /\^{.*?}/g.test(formula);
        const hasSubscript = /_{.*?}/g.test(formula);
        
        // 如果包含这些结构但不是块级模式，可能需要强制使用块级显示
        const forcedDisplayMode = !isBlockMode && (hasFrac || hasSuperscript || hasSubscript);
        
        katex.render(processedFormula, el, {
          throwOnError: false,
          displayMode: isBlockMode || forcedDisplayMode || displayMode,
          trust: true,
          strict: false
        });
        
        containerRef.current.appendChild(el);
      } catch (error) {
        console.error('Error rendering LaTeX:', error, formula);
        // 如果渲染失败，显示原始公式
        const fallbackNode = document.createElement('span');
        fallbackNode.className = 'latex-error';
        fallbackNode.innerText = isBlockMode ? `[Math: ${formula}]` : `(Math: ${formula})`;
        containerRef.current.appendChild(fallbackNode);
      }
    }
  }, [content, displayMode]);

  return <div ref={containerRef} className={`latex-content ${displayMode ? 'display-mode' : ''}`}></div>;
};

export default LatexRenderer;



