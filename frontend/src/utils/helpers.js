// utils/helpers.js
/**
 * Try to parse string as JSON, return original string if parsing fails
 * @param {string} str - String that may contain JSON
 * @returns {object|string} - Parsed object or original string
 */
export const tryParseJSON = (str) => {
  if (!str || typeof str !== 'string') return str;
  
  try {
    // Try to find JSON start and end positions
    const jsonStartIndex = str.indexOf('{');
    const jsonEndIndex = str.lastIndexOf('}') + 1;
    
    if (jsonStartIndex === -1 || jsonEndIndex <= jsonStartIndex) {
      // Check if it's array format
      const arrayStartIndex = str.indexOf('[');
      const arrayEndIndex = str.lastIndexOf(']') + 1;
      
      if (arrayStartIndex === -1 || arrayEndIndex <= arrayStartIndex) {
        return str; // Not JSON format
      }
      
      // Extract array format JSON
      const jsonPart = str.substring(arrayStartIndex, arrayEndIndex);
      return JSON.parse(jsonPart);
    }
    
    // Extract object format JSON
    const jsonPart = str.substring(jsonStartIndex, jsonEndIndex);
    return JSON.parse(jsonPart);
  } catch (e) {
    // Parsing failed, return original string
    return str;
  }
};

/**
 * Translate task type
 * @param {string} type - Task type
 * @returns {string} - Translated type
 */
export const translateTaskType = (type) => {
  const typeMap = {
    'Coding': 'Programming task',
    'Non-Coding': 'Non-programming tasks',
    'Read-Only': 'Read-only task'
  };
  
  return typeMap[type] || type;
};

/**
 * Translate dialogue step name
 * @param {string} step - Step name
 * @returns {string} - Translated step name
 */
export const translateDialogueStep = (step) => {
  const stepMap = {
    // Coding related steps
    'coding_prompt_generation': 'coding_prompt_generation',
    'coding_user_prompt': 'coding_user_prompt',
    'code_generation': 'code_generation',
    'code_review_prompt': 'code_review_prompt',
    'error_code_issue': 'error_code_issue',
    'reviewer_advice': 'reviewer_advice',
    'requirement_adder_prompt': 'requirement_adder_prompt',
    'original_prompt': 'original_prompt',
    'new_requirements': 'new_requirements',
    'execution_output': 'execution_output',
    'execution_summary': 'execution_summary',
    'summary_prompt': 'summary_prompt',
    
    // Non-coding steps
    'non_coding_prompt_generation': 'non_coding_prompt_generation',
    'non_coding_user_prompt': 'non_coding_user_prompt',
    'non_coding_solution': 'non_coding_solution',
    'solution_review_prompt': 'solution_review_prompt',
    'solution_for_review': 'solution_for_review',
    'solution_review': 'solution_review',
    'solution_revision_prompt': 'solution_revision_prompt',
    'solution_revision_request': 'solution_revision_request',
    'revised_solution': 'revised_solution',
    'solution_re_review_prompt': 'solution_re_review_prompt',
    'solution_for_re_review': 'solution_for_re_review',
    'solution_re_review': 'solution_re_review',
    
    // File reading steps
    'file_reading_task': 'file_reading_task',
    'file_reading_prompt': 'file_reading_prompt',
    'file_reading_code': 'file_reading_code',
    'file_reading_result': 'file_reading_result',
    'file_content': 'file_content',
    'read_only_prompt_generation': 'read_only_prompt_generation',
    'read_only_user_prompt': 'read_only_user_prompt',
    'read_only_solution': 'read_only_solution',
    'read_only_review_prompt': 'read_only_review_prompt',
    'read_only_for_review': 'read_only_for_review',
    'read_only_review': 'read_only_review',
    'read_only_revision_prompt': 'read_only_revision_prompt',
    'read_only_revision_request': 'read_only_revision_request',
    'read_only_revised_solution': 'read_only_revised_solution',
    'read_only_re_review_prompt': 'read_only_re_review_prompt',
    'read_only_for_re_review': 'read_only_for_re_review',
    'read_only_re_review': 'read_only_re_review',
    
    // Common steps
    'answer_extraction_prompt': 'answer_extraction_prompt',
    'code_for_extraction': 'code_for_extraction',
    'solution_for_extraction': 'solution_for_extraction',
    'read_only_for_extraction': 'read_only_for_extraction',
    'extracted_answer': 'extracted_answer',
    'read_only_extraction_prompt': 'read_only_extraction_prompt',
    'read_only_extracted_answer': 'read_only_extracted_answer'
  };
  
  return stepMap[step] || step;
};

/**
 * Clean dialogue content, remove possible duplicate tags
 * @param {string} content - Original content
 * @param {string} step - Step name
 * @returns {string} - Cleaned content
 */
export const cleanDialogueContent = (content, step) => {
  if (!content || typeof content !== 'string') return content;
  
  // Get translated step name
  const stepName = translateDialogueStep(step);
  
  // Check if content starts with step name (possibly duplicated)
  if (content.startsWith(stepName)) {
    return content.substring(stepName.length).trim();
  }
  
  // Check for duplicates like "Solution Review\nSolution Review\n"
  const lines = content.split('\n');
  if (lines.length > 1 && lines[0] === stepName && lines[1] === stepName) {
    return content.substring(stepName.length * 2 + 2).trim();
  }
  
  return content;
};

/**
 * Format JSON content display
 * @param {object|string} content - JSON object or string
 * @returns {JSX.Element} - Formatted JSX element
 */
export const formatJSONDisplay = (content) => {
  // If content is empty, return empty string directly
  if (!content) return '';
  
  // If it's a string, try to parse as JSON
  const jsonObj = typeof content === 'string' ? tryParseJSON(content) : content;
  
  // If it's not an object or array, return original content directly
  if (typeof jsonObj !== 'object' || jsonObj === null) return content;
  
  try {
    // Simply return formatted JSON string
    return JSON.stringify(jsonObj, null, 2);
  } catch (e) {
    return content; // If error occurs, return original content
  }
};

/**
 * Simplify status text display, remove redundant information
 * @param {string} statusText - Original status text
 * @returns {string} - Simplified status text
 */
export const simplifyStatusText = (statusText) => {
  if (!statusText) return '';
  
  // Remove common debug information
  return statusText
    .replace(/Estimated token usage.*?Total:.*?\n/g, '')
    .replace(/Making API request.*?\n/g, '')
    .replace(/Rate limit exceeded.*?Retrying\.\.\.\n/g, '')
    .replace(/Resetting subtask.*?status to retrying\n/g, '')
    .replace(/Debug output for.*?\n/g, '')
    .trim();
};

/**
 * Extract and beautify code blocks
 * @param {string} content - Content that may contain code blocks
 * @returns {Object} - Object containing extracted code and remaining content
 */
export const extractCodeBlocks = (content) => {
  if (!content || typeof content !== 'string') return { codeBlocks: [], remainingContent: content };
  
  // Match ``` followed by possible language identifier
  const codeBlockRegex = /```(python|javascript|js|bash|shell|sql|html|css|json|xml|yaml|cpp|java|csharp|php|ruby|golang|rust|swift|kotlin)?\s*([\s\S]*?)```/g;
  const codeBlocks = [];
  let remainingContent = content;
  let match;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || '';
    const code = match[2].trim();
    
    codeBlocks.push({
      language,
      code
    });
    
    remainingContent = remainingContent.replace(match[0], `<CODE_BLOCK_${codeBlocks.length - 1}>`);
  }
  
  return {
    codeBlocks,
    remainingContent
  };
};

/**
 * Clean prompt text, remove duplicate paragraphs and formatting markers
 * @param {string} promptText - Original prompt text
 * @returns {string} - Cleaned prompt text
 */
export const cleanPromptText = (promptText) => {
  if (!promptText || typeof promptText !== 'string') return promptText;
  
  // Step 1: Remove all \n- formatting markers
  let cleaned = promptText.replace(/\\n-/g, '\n• ');
  
  // Step 2: Replace <CODE_BLOCK_X> markers
  cleaned = cleaned.replace(/<CODE_BLOCK_\d+>/g, '[code block]');
  
  // Step 3: Normalize all quotes
  cleaned = cleaned.replace(/['']/g, "'").replace(/[""]/g, '"');
  
  // Step 4: Identify and remove duplicate paragraphs
  const paragraphs = cleaned.split('\n\n');
  const uniqueParagraphs = [];
  const seenContent = new Set();
  
  for (const para of paragraphs) {
    // Create simplified version for comparison (remove spaces and punctuation)
    const simplifiedPara = para.replace(/\s+/g, ' ').replace(/[.,;:!?]/g, '').toLowerCase();
    
    if (!seenContent.has(simplifiedPara) && simplifiedPara.length > 20) {
      uniqueParagraphs.push(para);
      seenContent.add(simplifiedPara);
    }
  }
  
  // Step 5: Recombine text and add appropriate formatting
  cleaned = uniqueParagraphs.join('\n\n');
  
  // Step 6: Improve format display
  cleaned = cleaned.replace(/Requirements:\\n-/g, 'Requirements:\n• ');
  cleaned = cleaned.replace(/\n- /g, '\n• ');
  
  // Step 7: Handle common formatting issues
  cleaned = cleaned.replace(/\{'sys_prompt': /g, '');
  cleaned = cleaned.replace(/, 'user_prompt': /g, '\n\nUser Prompt: ');
  cleaned = cleaned.replace(/\}\s*$/g, '');
  
  // Step 8: Handle double line breaks
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return cleaned;
};

/**
 * Comprehensive LaTeX pattern detection and processing
 * @param {string} content - Original content that may contain LaTeX
 * @returns {string} - Content with LaTeX expressions marked for rendering
 */
export const processLatex = (content) => {
  if (!content || typeof content !== 'string') return content;
  
  // Create a working copy
  let processed = content;
  
  // Step 1: First protect any existing HTML tags
  processed = processed.replace(/(<[^>]*>)/g, match => {
    return `___HTML_TAG_${btoa(match)}___`;
  });
  
  // Step 2: Process display math environments
  // Match display math with brackets: \[ ... \]
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, '<div class="latex-block">$1</div>');
  
  // Match display math with double dollars: $$ ... $$
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, '<div class="latex-block">$1</div>');
  
  // Match LaTeX environments like \begin{equation} ... \end{equation}
  const mathEnvironments = [
    'equation', 'align', 'gather', 'multline', 'eqnarray', 
    'flalign', 'alignat', 'cases', 'matrix', 'pmatrix', 
    'bmatrix', 'vmatrix', 'Vmatrix', 'array'
  ];
  
  mathEnvironments.forEach(env => {
    const pattern = new RegExp(`\\\\begin\\{${env}\\}([\\s\\S]*?)\\\\end\\{${env}\\}`, 'g');
    processed = processed.replace(pattern, `<div class="latex-block">\\begin{${env}}$1\\end{${env}}</div>`);
  });
  
  // Step 3: Process inline math
  // Match inline math with parentheses: \( ... \)
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, '<span class="latex-inline">$1</span>');
  
  // Match inline math with single dollars
  // Only match if there's no space after opening $ and before closing $
  // This regex also ensures the $ is not preceded by a number (to avoid currency)
  processed = processed.replace(/(?<!\d)\$(\S[\s\S]*?\S)\$/g, '<span class="latex-inline">$1</span>');
  
  // Match standalone LaTeX commands like \alpha, \beta, etc.
  processed = processed.replace(/\\([a-zA-Z]+)(?![a-zA-Z])/g, '<span class="latex-inline">\\$1</span>');
  
  // Step 4: Restore protected HTML tags
  processed = processed.replace(/___HTML_TAG_([A-Za-z0-9+/=]+)___/g, (match, base64) => {
    return atob(base64);
  });
  
  return processed;
};

/**
 * Enhanced KaTeX rendering function with comprehensive settings
 * @param {string} content - Content with identified LaTeX expressions
 * @returns {string} - HTML with rendered LaTeX
 */
const renderLatex = (content) => {
  if (!content || typeof content !== 'string') return content;
  
  // Process the content to identify LaTeX expressions
  const processedContent = processLatex(content);
  
  // Create a temporary div to parse the HTML with marked LaTeX
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = processedContent;
  
  // Define common LaTeX macros and commands
  const macros = {
    "\\Rightarrow": "\\Rightarrow",
    "\\Leftarrow": "\\Leftarrow",
    "\\Leftrightarrow": "\\Leftrightarrow",
    "\\rightarrow": "\\rightarrow",
    "\\leftarrow": "\\leftarrow",
    "\\leftrightarrow": "\\leftrightarrow",
    "\\quad": "\\quad",
    "\\qquad": "\\qquad",
    "\\frac": "\\frac",
    "\\text": "\\text",
    "\\textbf": "\\textbf",
    "\\textit": "\\textit",
    "\\mathbf": "\\mathbf",
    "\\mathit": "\\mathit",
    "\\mathrm": "\\mathrm",
    "\\mathcal": "\\mathcal",
    "\\mathscr": "\\mathscr",
    "\\mathfrak": "\\mathfrak",
    "\\mathbb": "\\mathbb",
    "\\boldsymbol": "\\boldsymbol",
    "\\overrightarrow": "\\overrightarrow",
    "\\overleftarrow": "\\overleftarrow",
    "\\overline": "\\overline",
    "\\underline": "\\underline",
    "\\widehat": "\\widehat",
    "\\widetilde": "\\widetilde",
    "\\partial": "\\partial",
    "\\nabla": "\\nabla",
    "\\infty": "\\infty",
    "\\sum": "\\sum",
    "\\prod": "\\prod",
    "\\int": "\\int",
    "\\iint": "\\iint",
    "\\iiint": "\\iiint",
    "\\oint": "\\oint",
    "\\lim": "\\lim",
    "\\sin": "\\sin",
    "\\cos": "\\cos",
    "\\tan": "\\tan",
    "\\arcsin": "\\arcsin",
    "\\arccos": "\\arccos",
    "\\arctan": "\\arctan",
    "\\sinh": "\\sinh",
    "\\cosh": "\\cosh",
    "\\tanh": "\\tanh",
    "\\log": "\\log",
    "\\ln": "\\ln",
    "\\exp": "\\exp",
    "\\because": "\\because",
    "\\therefore": "\\therefore",
    "\\implies": "\\implies",
    "\\impliedby": "\\impliedby",
    "\\iff": "\\iff"
  };
  
  // Common configuration for KaTeX
  const katexConfig = {
    throwOnError: false,         // Don't throw on parse errors
    strict: false,               // Be lenient in parsing
    macros: macros,              // Support for common macros
    trust: true,                 // Allow commands that could enable XSS attacks
    globalGroup: true,           // Process macros globally
    output: 'html',              // Output format
    fleqn: false,                // Display math left-aligned
    leqno: false,                // Equation numbers on left
    minRuleThickness: 0.05,      // Minimum line thickness
    maxSize: 10,                 // Maximum size of expressions
    maxExpand: 1000,             // Maximum macro expansions
    errorColor: '#cc0000',       // Color of error text
    colorIsTextColor: false      // Use color as text color
  };
  
  // Find all LaTeX elements
  const inlineElements = tempDiv.querySelectorAll('.latex-inline');
  const blockElements = tempDiv.querySelectorAll('.latex-block');
  
  // Render inline LaTeX
  inlineElements.forEach(element => {
    try {
      const latex = element.textContent;
      katex.render(latex, element, {
        ...katexConfig,
        displayMode: false
      });
    } catch (error) {
      console.error('Inline LaTeX rendering error:', error, 'for:', element.textContent);
      // Keep original content if rendering fails but mark it
      element.className += ' latex-error';
      element.setAttribute('title', 'LaTeX rendering error: ' + error.message);
    }
  });
  
  // Render block LaTeX
  blockElements.forEach(element => {
    try {
      const latex = element.textContent;
      katex.render(latex, element, {
        ...katexConfig,
        displayMode: true
      });
    } catch (error) {
      console.error('Block LaTeX rendering error:', error, 'for:', element.textContent);
      // Keep original content if rendering fails but mark it
      element.className += ' latex-error';
      element.setAttribute('title', 'LaTeX rendering error: ' + error.message);
    }
  });
  
  return tempDiv.innerHTML;
};