// components/AIDialogueSequence.jsx
import React, { useRef, useEffect, useState } from 'react';
import { 
  extractCodeBlocks, 
  translateDialogueStep, 
  tryParseJSON, 
  cleanPromptText,
  processLatex 
} from '../utils/helpers';
import katex from 'katex';  // Import KaTeX
import 'katex/dist/katex.min.css';  // Import KaTeX CSS
import axios from 'axios';  // Add axios import
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';  // VS Code dark theme

const AIDialogueSequence = ({ dialogues, currentIndex, onContinue, onEdit, onCompleteAll }) => {
  const dialogueContainerRef = useRef(null);
  const currentDialogueRef = useRef(null);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);  // Add save file state
  const [isDownloading, setIsDownloading] = useState(false);  // Add download state

  useEffect(() => {
    if (currentDialogueRef.current) {
      currentDialogueRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'nearest'
      });
    } else if (dialogueContainerRef.current) {
      dialogueContainerRef.current.scrollTop = dialogueContainerRef.current.scrollHeight;
    }
  }, [currentIndex]);

  // Handle skip all functionality
  const handleSkipAll = async () => {
    if (isSkipping || currentIndex >= dialogues.length - 1) return;
    
    // Confirm with user
    if (!window.confirm('Are you sure you want to skip all remaining dialogue steps? This will automatically complete all steps without showing details.')) {
      return;
    }
    
    setIsSkipping(true);
    
    try {
      let stepIndex = currentIndex;
      
      // Continue through all remaining steps
      while (stepIndex < dialogues.length - 1) {
        // Call onContinue to move to next step
        await onContinue();
        stepIndex++;
        
        // Add a small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // After reaching the last step, complete all
      if (stepIndex === dialogues.length - 1) {
        await onCompleteAll();
      }
      
    } catch (error) {
      console.error('Error skipping dialogue steps:', error);
      alert('Failed to skip dialogue steps. Please try continuing manually.');
    } finally {
      setIsSkipping(false);
    }
  };

  // Add save file function
  const handleSaveToFile = async (dialogue) => {
    // Extract code content
    const { codeBlocks } = extractCodeBlocks(dialogue.content);
    
    if (!codeBlocks || codeBlocks.length === 0) {
      alert('No code found in this message');
      return;
    }
    
    // Find possible file path from dialogue content
    const filePathMatch = dialogue.content.match(/['"](\.\/temp\/[^'"]+)['"]/);
    let suggestedPath = './temp/output.py';  // Default path
    
    if (filePathMatch) {
      suggestedPath = filePathMatch[1];
    }
    
    // Prompt user to enter file path
    const filePath = prompt('Enter the file path to save:', suggestedPath);
    
    if (!filePath) {
      return;  // User canceled
    }
    
    setIsSavingFile(true);
    
    try {
      // Combine all code blocks
      const fullCode = codeBlocks.map(block => block.code).join('\n\n');
      
      // Call backend API to save file
      const response = await axios.post(
        `${import.meta.env.VITE_SAVE_FILE_URL}/save-file`,
        {
          file_path: filePath,
          content: fullCode
        }
      );
      
      if (response.data.success) {
        alert(`File saved successfully!\nPath: ${response.data.file_path}\nSize: ${response.data.file_size} bytes`);
      } else {
        alert('Failed to save file: ' + (response.data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving file:', error);
      alert('Error saving file: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsSavingFile(false);
    }
  };

  // Add download code function
  const handleDownloadCode = (dialogue) => {
    // Extract code content
    const { codeBlocks } = extractCodeBlocks(dialogue.content);
    
    if (!codeBlocks || codeBlocks.length === 0) {
      alert('No code found in this message');
      return;
    }
    
    setIsDownloading(true);
    
    try {
      // If there are multiple code blocks, combine them
      const fullCode = codeBlocks.map((block, index) => {
        let content = block.code;
        
        // If there are multiple code blocks, add separator comments
        if (codeBlocks.length > 1) {
          const language = block.language || 'code';
          content = `// === Code Block ${index + 1} (${language}) ===\n${content}`;
        }
        
        return content;
      }).join('\n\n');
      
      // Determine file extension
      const primaryLanguage = codeBlocks[0].language || 'txt';
      const extensionMap = {
        'python': 'py',
        'javascript': 'js',
        'typescript': 'ts',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'html': 'html',
        'css': 'css',
        'sql': 'sql',
        'bash': 'sh',
        'shell': 'sh',
        'json': 'json',
        'xml': 'xml',
        'yaml': 'yml',
        'php': 'php',
        'ruby': 'rb',
        'go': 'go',
        'rust': 'rs',
        'swift': 'swift',
        'kotlin': 'kt',
        'csharp': 'cs'
      };
      
      const fileExtension = extensionMap[primaryLanguage] || 'txt';
      
      // Generate filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `ai_generated_code_${timestamp}.${fileExtension}`;
      
      // Create and download file
      const blob = new Blob([fullCode], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      // Create temporary download link
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up URL object
      URL.revokeObjectURL(url);
      
      // Show success message
      alert(`Code downloaded successfully as: ${filename}`);
      
    } catch (error) {
      console.error('Error downloading code:', error);
      alert('Error downloading code: ' + error.message);
    } finally {
      setIsDownloading(false);
    }
  };

  // Check if dialogue contains code
  const hasCode = (dialogue) => {
    return dialogue.content && (
      dialogue.content.includes('```') || 
      dialogue.step === 'code_generation' ||
      dialogue.step === 'file_reading_code'
    );
  };

  // Function to render LaTeX expressions
  const renderLatex = (content) => {
    if (!content || typeof content !== 'string') return content;
    
    // First process the content to identify LaTeX expressions
    const processedContent = processLatex(content);
    
    // Create a temporary div to parse the HTML with marked LaTeX
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = processedContent;
    
    // Find all LaTeX elements
    const inlineElements = tempDiv.querySelectorAll('.latex-inline');
    const blockElements = tempDiv.querySelectorAll('.latex-block');
    
    // Render inline LaTeX
    inlineElements.forEach(element => {
      try {
        const latex = element.textContent;
        katex.render(latex, element, {
          throwOnError: false,
          displayMode: false
        });
      } catch (error) {
        console.error('LaTeX rendering error:', error);
        // Keep the original content if rendering fails
      }
    });
    
    // Render block LaTeX
    blockElements.forEach(element => {
      try {
        const latex = element.textContent;
        katex.render(latex, element, {
          throwOnError: false,
          displayMode: true
        });
      } catch (error) {
        console.error('LaTeX rendering error:', error);
        // Keep the original content if rendering fails
      }
    });
    
    return tempDiv.innerHTML;
  };

  // Helper function: escape HTML
  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // New: function to extract key information from task
  const extractKeyInfoFromTask = (content) => {
    try {
      // Try to parse content
      if (typeof content === 'string' && content.includes('{') && content.includes('}')) {
        // Use regular expressions to extract key information
        const orderMatch = content.match(/'order':\s*(\d+)/);
        const taskMatch = content.match(/'task':\s*'([^']+)'/);
        const descriptionMatch = content.match(/'description':\s*"([^"]+)"|'description':\s*'([^']+)'/);
        const typeMatch = content.match(/'Type':\s*'([^']+)'/);
        const statusMatch = content.match(/'Status':\s*'([^']+)'/);
        const expectedOutputMatch = content.match(/'Expected Output':\s*"([^"]+)"|'Expected Output':\s*'([^']+)'/);
        
        const keyInfo = {
          order: orderMatch ? orderMatch[1] : 'N/A',
          task: taskMatch ? taskMatch[1] : 'N/A',
          description: descriptionMatch ? (descriptionMatch[1] || descriptionMatch[2]) : 'N/A',
          Type: typeMatch ? typeMatch[1] : 'N/A',
          Status: statusMatch ? statusMatch[1] : 'Not specified',
          ExpectedOutput: expectedOutputMatch ? (expectedOutputMatch[1] || expectedOutputMatch[2]) : 'Not specified'
        };
        
        return keyInfo;
      }
      
      return null;
    } catch (e) {
      console.error('Error extracting key info:', e);
      return null;
    }
  };

  // New: function to format display content
  const formatFileReadingTask = (content) => {
    // Check if it contains ai_dialogues (indicating historical records)
    if (content.includes('ai_dialogues') && content.length > 500) {
      const keyInfo = extractKeyInfoFromTask(content);
      
      if (keyInfo) {
        // Return formatted key information
        return `{'order': ${keyInfo.order}, 'task': '${keyInfo.task}', 'description': "${keyInfo.description}", 'Expected Output': "${keyInfo.ExpectedOutput}", 'Type': '${keyInfo.Type}', 'Status': '${keyInfo.Status}'}`;
      }
    }
    
    // If no simplification needed, return original content
    return content;
  };

  // New: component to render code blocks
  const CodeBlock = ({ code, language }) => {
    const [copied, setCopied] = useState(false);
    
    const handleCopy = () => {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    
    return (
      <div className="inline-code-block">
        <div className="code-header">
          <span className="code-language">{language || 'code'}</span>
          <button className="copy-code-btn" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <SyntaxHighlighter
          language={language || 'python'}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            borderRadius: '0 0 4px 4px',
            fontSize: '14px',
            padding: '1em'
          }}
          showLineNumbers={true}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    );
  };

  if (!dialogues || dialogues.length === 0) {
    return <div className="ai-dialogue-empty">No AI dialogue records available</div>;
  }

  const visibleDialogues = dialogues.slice(0, currentIndex + 1);
  const isLastDialogue = currentIndex === dialogues.length - 1;

  // Detect if contains complex nested ai_dialogues objects
  const containsNestedDialogues = (content) => {
    if (typeof content !== 'string') return false;
    
    // Check if contains ai_dialogues keyword and contains a lot of nested structures
    return content.includes('ai_dialogues') && 
           (content.includes('original_content') || 
            content.match(/'role':/g)?.length > 3 ||
            content.length > 1000);
  };

  // Render dialogue content
  const renderDialogueContent = (dialogue) => {
    if (!dialogue || !dialogue.content) {
      return <p className="empty-content">No content</p>;
    }
    
    // Check if it's original prompt
    const isOriginalPrompt = dialogue.step === 'coding_prompt_generation' || 
                            dialogue.step === 'non_coding_prompt_generation' ||
                            dialogue.content.includes('original prompt') ||
                            dialogue.content.includes('sys_prompt');
    
    // If it's original prompt, apply cleaning function
    let cleanedContent = isOriginalPrompt 
      ? cleanPromptText(dialogue.content)
      : dialogue.content;
    
    // Special handling for file_reading_task - newly added logic
    if (dialogue.step === 'file_reading_task') {
      cleanedContent = formatFileReadingTask(cleanedContent);
    }
    
    // Handle complex nested system prompts
    if ((dialogue.step === 'summary_prompt' || dialogue.step === 'answer_extraction_prompt') && 
        containsNestedDialogues(cleanedContent)) {
      const stepName = translateDialogueStep(dialogue.step);
      return (
        <div className="dialogue-simplified-prompt">
          <p className="prompt-notice">{stepName} (System internal instructions simplified for display)</p>
          <details>
            <summary>View detailed content</summary>
            <div className="dialogue-text-full">
              {cleanedContent.substring(0, 300)}...
              <span className="truncated-notice">(Content truncated)</span>
            </div>
          </details>
        </div>
      );
    }
    
    // Special handling for original prompts
    if (isOriginalPrompt) {
      return (
        <div className="original-prompt-container">
          <div className="original-prompt-content">
            {cleanedContent}
          </div>
        </div>
      );
    }
    
    // Handle code blocks - use syntax highlighting
    if (dialogue.step === 'code_generation' || 
        dialogue.step === 'file_reading_code' || 
        dialogue.content.includes('```') ||
        dialogue.content.includes('<CODE_BLOCK_')) {
      
      const { codeBlocks, remainingContent } = extractCodeBlocks(cleanedContent);
      
      if (codeBlocks && codeBlocks.length > 0) {
        return (
          <div className="dialogue-text-with-code">
            {/* Handle text before code blocks */}
            {remainingContent && remainingContent.split('<CODE_BLOCK_')[0] && (
              <div className="dialogue-text">
                {remainingContent.split('<CODE_BLOCK_')[0]}
              </div>
            )}
            
            {/* Render code blocks and text between them */}
            {codeBlocks.map((codeObj, index) => {
              const afterCodePattern = new RegExp(`<CODE_BLOCK_${index}>([\\s\\S]*?)(?=<CODE_BLOCK_|$)`);
              const afterCodeMatch = remainingContent.match(afterCodePattern);
              const textAfterCode = afterCodeMatch ? afterCodeMatch[1] : '';
              
              return (
                <React.Fragment key={index}>
                  <CodeBlock code={codeObj.code} language={codeObj.language} />
                  {textAfterCode && (
                    <div className="dialogue-text" 
                         dangerouslySetInnerHTML={{ 
                           __html: textAfterCode.includes('\\(') || textAfterCode.includes('\\[') || 
                                   textAfterCode.includes('$$') || textAfterCode.includes('$') 
                                   ? renderLatex(textAfterCode) 
                                   : textAfterCode 
                         }} 
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        );
      }
    }
    
    // Try to parse JSON content
    const jsonContent = tryParseJSON(cleanedContent);
    if (typeof jsonContent === 'object' && jsonContent !== null) {
      return (
        <div className="dialogue-json">
          <pre>{JSON.stringify(jsonContent, null, 2)}</pre>
        </div>
      );
    }
    
    // Check if contains standalone review result "NO"
    // Modify in AIDialogueSequence.jsx
    if (dialogue.step && dialogue.step.includes('review') && cleanedContent.trim() === 'NO') {
      // Differentiate based on specific step type
      if (dialogue.step === 'reviewer_advice' || dialogue.step === 'code_review') {
        // Code review scenario - NO means unsolvable
        return (
          <div className="dialogue-review-content">
            <div className="review-failed">
              <span className="review-icon">❌</span> 
              <span className="review-message">Cannot be solved by modifying the code</span>
            </div>
          </div>
        );
      } else if (dialogue.step === 'solution_review' || dialogue.step === 'read_only_review') {
        // Non-coding task review scenario - NO means passed
        return (
          <div className="dialogue-review-content">
            <div className="review-passed">
              <span className="review-icon">✓</span> 
              <span className="review-message">Review passed, no issues found</span>
            </div>
          </div>
        );
      }
    }
    
    // Default text display - add LaTeX support
    if (typeof cleanedContent === 'string') {
      // Check if content has potential LaTeX expressions
      if (cleanedContent.includes('\\(') || cleanedContent.includes('\\[') || 
          cleanedContent.includes('$$') || cleanedContent.includes('$')) {
        // Apply LaTeX rendering
        const renderedContent = renderLatex(cleanedContent);
        return <div className="dialogue-text" dangerouslySetInnerHTML={{ __html: renderedContent }} />;
      }
    }
    
    // Original default text display
    return <div className="dialogue-text">{cleanedContent}</div>;
  };

  return (
    <div className="ai-dialogue-sequence">
      <div className="ai-dialogue-header">
        <h3>AI dialogue process ({currentIndex + 1}/{dialogues.length})</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="dialogue-progress">
            {dialogues.map((_, idx) => (
              <span 
                key={idx} 
                className={`progress-dot ${idx <= currentIndex ? 'active' : ''}`}
              />
            ))}
          </div>
          {/* Skip All button */}
          {currentIndex < dialogues.length - 1 && (
            <button
              className="skip-all-btn"
              onClick={handleSkipAll}
              disabled={isSkipping}
            >
              {isSkipping ? (
                <>
                  <span className="loading-spinner">
                    <span className="spinner-dot"></span>
                    <span className="spinner-dot"></span>
                    <span className="spinner-dot"></span>
                  </span>
                  Skipping...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 5L19 12L5 19V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Skip All
                </>
              )}
            </button>
          )}
        </div>
      </div>
      
      <div className="ai-dialogue-current" ref={dialogueContainerRef}>
        {visibleDialogues.map((dialogue, idx) => (
          <div 
            key={idx} 
            className={`ai-dialogue-item ${dialogue.role} ${idx === currentIndex ? 'current' : 'previous'}`}
            ref={idx === currentIndex ? currentDialogueRef : null}
          >
            <div className="dialogue-avatar">
              {dialogue.role === 'system' ? 'S' : 
               dialogue.role === 'user' ? 'U' : 'AI'}
            </div>
            
            <div className="dialogue-bubble">
              <div className="dialogue-meta">
                <span className="dialogue-step">
                  {translateDialogueStep(dialogue.step)}
                </span>
                {dialogue.isEdited && <span className="dialogue-edited">Edited</span>}
              </div>
              
              <div className="dialogue-content">
                {renderDialogueContent(dialogue)}
              </div>
              
              {/* Move action buttons below dialogue content */}
              {idx === currentIndex && !isSkipping && (
                <div className="dialogue-actions below-content">
                  <button 
                    className="dialogue-edit-btn"
                    onClick={() => onEdit(currentIndex)}
                  >
                    Edit this message
                  </button>
                                    
                  <button 
                    className="dialogue-continue-btn"
                    onClick={isLastDialogue ? onCompleteAll : onContinue}
                  >
                    {isLastDialogue ? 'Finish and view the result' : 'Proceed to the next step'}
                  </button>

                  {/* New download code button */}
                  {hasCode(dialogue) && (
                    <button 
                      className="dialogue-download-code-btn"
                      onClick={() => handleDownloadCode(dialogue)}
                      disabled={isDownloading}
                    >
                      {isDownloading ? (
                        <>
                          Downloading...
                          <span className="loading-spinner">
                            <span className="spinner-dot"></span>
                            <span className="spinner-dot"></span>
                            <span className="spinner-dot"></span>
                          </span>
                        </>
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Download Code
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AIDialogueSequence;