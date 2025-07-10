from openai import AzureOpenAI
from openai import OpenAI
import sys
import json
import traceback
import re
import os
import io
import time
import tiktoken  # Need to install: pip install tiktoken
from flask import Flask, request, jsonify, Response 
import traceback
import uuid
import numpy as np
import shutil
import filecmp
import pandas as pd
from flask_cors import CORS
import subprocess
from collections import defaultdict

app = Flask(__name__)
CORS(app)

# 用户 API Keys 存储（生产环境应使用数据库并加密存储）
user_api_keys = defaultdict(str)

# 默认 API Key（从环境变量获取，作为后备选项）
DEFAULT_API_KEY = os.getenv('OPENAI_API_KEY', '')

# Token counting function, used to estimate token usage before API calls
def count_tokens(text, model="gpt-4o"):
    """Count the number of tokens in a text string"""
    try:
        encoding = tiktoken.encoding_for_model(model)
        return len(encoding.encode(text))
    except Exception:
        # If tiktoken fails, use rough estimate
        return len(text) // 4  # Rough approximation

def truncate_text(text, max_tokens, model="gpt-4o"):
    """Truncate text to fit within token limit"""
    try:
        encoding = tiktoken.encoding_for_model(model)
        tokens = encoding.encode(text)
        if len(tokens) <= max_tokens:
            return text
        
        # Truncate tokens and decode back to text
        truncated_tokens = tokens[:max_tokens]
        return encoding.decode(truncated_tokens)
    except Exception as e:
        print(f"Error truncating text: {e}")
        # Fall back to simple character-based truncation
        ratio = max_tokens / (len(text) // 4)  # Rough approximation
        return text[:int(len(text) * ratio)]

def get_api_key_for_user(username=None, session_id=None):
    """获取用户的 API Key，如果没有则返回默认值"""
    if username and username in user_api_keys:
        return user_api_keys[username]
    
    # 如果 session_id 关联了用户，也可以通过 session 获取
    # 这里需要实现 session 到用户的映射逻辑
    
    # 返回默认 API Key
    return DEFAULT_API_KEY

def ask_gpt4o(sys_prompt, user_prompt, history='', max_retries=3, backoff_factor=2, username=None):
    """
    Send a request to the GPT-4o model with retry logic to handle rate limits
    使用用户特定的 API Key
    """
    # Estimate token count before making the request
    system_tokens = count_tokens(sys_prompt)
    user_tokens = count_tokens(user_prompt)
    history_tokens = count_tokens(history)
    estimated_total = system_tokens + user_tokens + history_tokens
    
    print(f"Estimated token usage - System: {system_tokens}, User: {user_tokens}, History: {history_tokens}, Total: {estimated_total}")
    
    # If estimated token count is too high, truncate inputs
    max_tokens = 25000  # Leave room for response
    if estimated_total > max_tokens:
        print(f"Warning: Estimated token count ({estimated_total}) exceeds limit ({max_tokens}). Truncating input.")
        
        # Keep system prompt intact if possible
        if system_tokens < max_tokens // 3:
            # Distribute remaining tokens between user prompt and history
            remaining_tokens = max_tokens - system_tokens
            # Prioritize user prompt over history
            max_user_tokens = min(user_tokens, remaining_tokens * 2 // 3)
            max_history_tokens = remaining_tokens - max_user_tokens
            
            # Truncate user prompt and history if needed
            if user_tokens > max_user_tokens:
                user_prompt = truncate_text(user_prompt, max_user_tokens)
            if history_tokens > max_history_tokens and history:
                history = truncate_text(history, max_history_tokens)
        else:
            # If system prompt is too large, proportionally truncate everything
            sys_prompt = truncate_text(sys_prompt, max_tokens // 3)
            user_prompt = truncate_text(user_prompt, max_tokens // 3)
            if history:
                history = truncate_text(history, max_tokens // 3)
    
    # 获取用户的 API Key
    api_key = get_api_key_for_user(username)
    
    if not api_key:
        raise Exception("No API key available. Please set your OpenAI API key.")
    
    client = OpenAI(api_key=api_key)
    
    # Prepare messages
    messages = [
        {"role": "system", "content": "Previous Chat History: "+ history + '''END OF HISTORY\n\nNew Chat: ''' + sys_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    for attempt in range(max_retries):
        try:
            print(f"Making API request (attempt {attempt + 1}/{max_retries})")
            response = client.chat.completions.create(
                model="gpt-4o", 
                messages=messages
            )
            return response.choices[0].message.content
        except Exception as e:
            error_str = str(e)
            print(f"API request failed: {error_str}")
            
            # Check if it's a rate limit error
            if "rate_limit" in error_str.lower() or "429" in error_str:
                if attempt < max_retries - 1:
                    # Calculate backoff time
                    wait_time = backoff_factor ** attempt
                    print(f"Rate limit exceeded. Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                    continue
            
            # For other errors or if we've exhausted retries
            raise

def json_extractor(response):
    try:
        start_idx = response.index("[")
        end_idx = response.rindex("]") + 1
        json_content = response[start_idx:end_idx]
        js = json.loads(json_content)
        return js
    except (ValueError, json.JSONDecodeError) as e:
        print('Format error:', e)
        print(json_content)
        return []

# Function to split main task into subtasks
def split_main_task(main_task, n = 5, username=None):
    splitor_sys_prompt = f'You are a task planner. Break down the following task into {n} smaller subtasks.'+"""
        Please list the subtasks in the format of json. Your answer must only include three columns: "order", "task", and "description". The key of json items must be written in double quote.
        If there are any temporary files that will be used in the future steps, save them in the path: './temp/temp_file_name', and describe these operations in 'description'. If there is nothing need to be modified, then 
        Example:
        [
        {"order": 1, "task": "Load and Inspect data", "description": "Load the first 100 data in './temp/data.csv'. Perform basic inspections, such as checking for missing values, data types, and ensuring the data matches expected formats. If there are any discrepancies, print an alert for further cleaning steps."},
        {"order": 2, "task": "Clean data", "description": "Based on the result of data inspection, process the data in './temp/data.csv' to remove any anomalies or errors, and save it in the path './temp/cleaned_data.csv'"},
        {"order": 3, "task": "Analyze data", "description": "Perform correlation analysis on the cleaned data, './temp/cleaned_data.csv'."},
        {"order": 4, "task": "Get a conclusion", "description": "Summary the results of the analysis into a comprehensive response, which can directly answer the user's question: [USER QUESTION]"}
        ]
         Note that you have no need to solve the problem by yourself. You only need to split it into several smaller tasks.
    """
    optimizor_sys_prompt = f"You are a plan optimizer. You will be provided with a plan. This plan is intended to solve the big task: {main_task}. This task is split into several subtasks."+"""
    The format of this plan is a list of json. This json only contains 3 columns: order, task, and description.
    Input Example:
    [
    {"order": [an integer representing the order of this subtask], "task": [a string representing the name of this subtask], "description": [a string describing the implementation detail of this subtask]},
    ...
    ]
    Your responsibility is to:
        1. For each subtask, determine the expected outputs and append an "Expected Output" column to the JSON representation of each subtask. This column should succinctly describe the nature of the outputs generated by the subtask. As the output from one subtask serves as the input for the subsequent one, it's crucial that the "Expected Output" column clearly outlines what the next subtask's agent will be able to utilize. Since none of the subtasks have been executed yet, you do not need to provide specific output values; instead, focus on describing the type or path of information that will be produced.
        2. Determine whether a subtask is a coding task, based on the nature of the subtask and the description. Add one more column, named "Type", to the json of each subtask. If implementing this subtask needs code and execution, the "Type" of this subtask should be "Coding". (Saving some description into a file is also a coding task.) If no coding needed, only describing, reasoning, or analysing with plain text, the "Type" should be "Non-Coding". If this task needs to read a file but do not need to modify anything, the "Type" should be "Read-Only". Please note that, "Read-Only" only applies for intermediate step that needs to read the temp file from the previous step. If you want to inspect data, you need to use statistical methods and it should be a coding task.
        3. Revise the descriptions for all subtasks to ensure continuity and coherence of information across steps. Each subtask should use information from previous steps, and its outputs should feed into subsequent steps. Pay attention to maintaining consistency in terminology throughout.
        4. The output format should be the same as the input, i.e. a list of json. There should be 5 columns for each json: "order", "task", "description", "Expected Output", and "Type".
        5. If any intermediate steps require saving temporary files that are needed for later steps, please specify the saving path in both "description" and the "Expected Output". Ensure all temporary files are saved to the following directory: './temp/temp_file_name'. For machine learning problems, saving the weights into './temp' folder is required.
        6. Please generate the required information ensuring that all curly braces ({ and }) appearing in the text that are not intended to represent JSON structures are properly escaped. This means each { should be written as \\{ and each } as \\} unless they are part of a JSON object or array. This is essential to maintain the integrity of the text when it's processed as JSON data in subsequent steps. 
        7. The key of json items must be written in double quote.
    """
    for attempt in range(3):
        response = ask_gpt4o(splitor_sys_prompt, "The user's question is: "+main_task, username=username)
        subtasks = json_extractor(response)
        if subtasks == []:
            print(f"Attempt {attempt + 1} failed...")
            continue
        # Extract JSON from response
        try:
            while True:
                optimized_subtasks = ask_gpt4o(optimizor_sys_prompt,str(subtasks), username=username)
                optimized_subtasks = json_extractor(optimized_subtasks)
                if optimized_subtasks != []:
                    break
            for subtask in optimized_subtasks:
                subtask['Status'] = "Not yet started..."
            print('-----------------')
            print('Initial Plan')
            print('-----------------')
            print(json.dumps(subtasks, indent=4))
            print('-----------------')
            print('Optimized Plan')
            print('-----------------')
            print(json.dumps(optimized_subtasks,indent=4))
            
            
            
            return optimized_subtasks
        except (ValueError, json.JSONDecodeError) as e:
            print(f"Attempt {attempt + 1} failed: {e}")

    print("Could not parse JSON after 3 attempts.")
    return []

def execute_code(code):

    # Backup current stdout and stderr
    stdout_backup = sys.stdout
    stderr_backup = sys.stderr

    # Redirect stdout and stderr to StringIO objects to capture them
    sys.stdout = io.StringIO()
    sys.stderr = io.StringIO()

    try:
        # Try to execute the code
        exec(code)

        # If execution is successful, capture the output
        output_content = sys.stdout.getvalue()

        # Restore original stdout and stderr
        sys.stdout = stdout_backup
        sys.stderr = stderr_backup

        return {"success": True, "output": output_content, "error_message": None}

    except Exception as e:
        # Capture the exception message
        error_message = traceback.format_exc()

        # Capture current stdout and stderr content
        output_content = sys.stdout.getvalue()
        error_output = sys.stderr.getvalue()

        # Restore original stdout and stderr
        sys.stdout = stdout_backup
        sys.stderr = stderr_backup

        # Return response with error details
        return {"success": False, "output": output_content, "error_message": error_message, "error_output": error_output}

def generate_prompts_coding(main_task, subtasks, subtask, include_full_context=False, username=None):
    """
    Generate prompts for coding tasks with optional context reduction
    """
    helper_prompt = f"""You are responsible for determining whether a given coding task requires external dataset information to be executed correctly.
The system is solving the problem: {main_task}. Now you are responsible for evaluating the task of order {subtask['order']}: {subtask['task']}.
1. If the task does **not** require accessing any external dataset or reading files, reply with **only**: `NO`
2. If the task **involves reading, loading, or extracting data from an external file (CSV, JSON, Excel, database, or any other format)**, you **must** return the required information.
3. If the task involves **data preprocessing, feature engineering, filtering, summarization, aggregation, machine learning training, or any operation on a dataset**, check if prior subtasks indicate dataset dependency.
4. If **any** part of the task requires file access, specify the **exact dataset path** and **the required information** to be extracted.
5. Respond `NO` only when you think this task has no need to access any external file.
### **Important Restrictions**
**Do NOT request statistical analysis, such as means, medians, distributions, correlation matrices, or outlier detection.**  
**Only request basic structural information, such as:**
   - **Column names**
   - **Data types for each column**
   - **A few sample values from key columns**"""

    # Create simplified subtask list without full details to reduce tokens
    simplified_subtasks = []
    if include_full_context:
        # Use full subtask data
        context_subtasks = subtasks
    else:
        # Create minimal context with only current subtask and its dependencies
        for s in subtasks:
            # Include completed subtasks (for context) and current subtask
            if s['order'] <= subtask['order']:
                # Create minimal representation
                simplified_subtask = {
                    'order': s['order'],
                    'task': s['task'],
                    'description': s['description'],
                    'Type': s['Type']
                }
                
                # Only add status for completed tasks
                if s['order'] < subtask['order'] and 'Status' in s:
                    # Truncate status to save tokens
                    status = s.get('Status', '')
                    if isinstance(status, str) and len(status) > 200:
                        simplified_subtask['Status'] = status[:200] + "... [truncated]"
                    else:
                        simplified_subtask['Status'] = status
                
                simplified_subtasks.append(simplified_subtask)
        
        context_subtasks = simplified_subtasks

    external_question = ask_gpt4o(helper_prompt, f"the task to be evaluated: {subtask['task']}", username=username)
    print('External Question:', external_question)
    
    if external_question == 'NO':
        external_info = None
    else:
        data_accessor_prompt = "You are responsible for writing code that extracts relevant dataset information based on the provided requirements. Generate a Python script to load and inspect the dataset. Extract only the requested information (e.g., column names, data types, sample values, etc). **Print** the extracted results clearly so they can be used by subsequent agents. No visualization should be done."
        code_string = ask_gpt4o(data_accessor_prompt, external_question, username=username)
        start_index = code_string.find('```python')
        end_index = code_string.rfind('```')
        if start_index != -1 and end_index != -1 and start_index < end_index:
            extracted_code = code_string[start_index + len('```python'):end_index].strip()
        else:
            print(code_string)
            raise Exception("Could not find valid code in the provided string.")
        external_info = execute_code(extracted_code)
        summarizer_prompt = f"""You are responsible for summarizing the dataset information extracted by the Data Access Agent.
1. **Required Information**: {external_question}
2. **Extracted Information**: {external_info}
- Match each requested dataset attribute with its corresponding extracted value.
- Present the information in a structured, easy-to-use format.
 Example:
 - Column Names: ['product_id', 'category', 'price', 'quantity']
- Data Types:
  - product_id: int64
  - category: object
  - price: float64
  - quantity: int64
        """
        external_info = ask_gpt4o(summarizer_prompt, '', username=username)
        print('External Information:', external_info)
    
    # Create more concise system prompt
    sys_prompt = f"You are a prompt generator for a coding task. The main problem is: {main_task}. You are generating a prompt for subtask {subtask['order']}: {subtask['task']}."
    
    # Create detailed but efficient user prompt
    user_prompt = f"""Subtask details:
- Task: {subtask['task']}
- Description: {subtask['description']}
- Expected Output: {subtask.get('Expected Output', 'Not specified')}
- Type: {subtask['Type']}

Context from previous subtasks (abbreviated):
{json.dumps(context_subtasks, indent=2)}

Your job is to create two prompts:
1. A system prompt that clearly defines the role for the code writer
2. A user prompt with specific instructions for implementing this subtask

Return ONLY a JSON with this format:
{{
  "sys_prompt": "...",
  "user_prompt": "..."
}}"""

    response = ask_gpt4o(sys_prompt, user_prompt, username=username)
    
    try:
        start_idx = response.index("{")
        end_idx = response.rindex("}") + 1
        json_content = response[start_idx:end_idx]
        js = json.loads(json_content)
        if external_info != None:
            js["user_prompt"] += f'Here are some supporting information of the file used: {external_info}'
        return js
    except (ValueError, json.JSONDecodeError) as e:
        print('Format error:', e)
        print('New attempt to generate prompts for coding task...')
        # Try with a more direct approach and less context
        sys_prompt = "You are a coding prompt generator."
        user_prompt = f"Create a system and user prompt for this coding task: {subtask['task']} - {subtask['description']}. Format as JSON with sys_prompt and user_prompt keys."
        
        response = ask_gpt4o(sys_prompt, user_prompt, username=username)
        try:
            start_idx = response.index("{")
            end_idx = response.rindex("}") + 1
            json_content = response[start_idx:end_idx]
            js = json.loads(json_content)
            if external_info != None:
                js["user_prompt"] += f'Here are some supporting information of the file used: {external_info}'
            return js
        except:
            # Last resort - create basic prompts
            return {
                "sys_prompt": f"You are a programmer implementing this task: {subtask['task']}",
                "user_prompt": f"Write code for the following task: {subtask['description']}" + (f' Supporting info: {external_info}' if external_info else '')
            }


def generate_prompts_non_coding(main_task, subtasks, subtask, include_full_context=False, username=None):
    """Generate prompts for non-coding tasks, with optional context reduction"""
    # Similar approach to coding prompts
    
    # Create minimal context
    if include_full_context:
        context_subtasks = subtasks
    else:
        simplified_subtasks = []
        for s in subtasks:
            if s['order'] <= subtask['order']:
                simplified_subtask = {
                    'order': s['order'],
                    'task': s['task'],
                    'description': s['description']
                }
                
                if s['order'] < subtask['order'] and 'Status' in s:
                    status = s.get('Status', '')
                    if isinstance(status, str) and len(status) > 200:
                        simplified_subtask['Status'] = status[:200] + "... [truncated]"
                    else:
                        simplified_subtask['Status'] = status
                
                simplified_subtasks.append(simplified_subtask)
        
        context_subtasks = simplified_subtasks
    
    # Create more concise system prompt
    sys_prompt = f"You are a prompt generator for a non-coding task. Problem: {main_task}. Subtask: {subtask['task']}."
    
    # Create more efficient user prompt
    user_prompt = f"""Subtask details:
- Order: {subtask['order']}
- Task: {subtask['task']}
- Description: {subtask['description']}
- Expected Output: {subtask.get('Expected Output', 'Not specified')}

Create system and user prompts for a domain expert to solve this subtask using only plain text (no code).
Return ONLY a JSON with this format:
{{
  "sys_prompt": "...",
  "user_prompt": "..."
}}"""

    while True:
        try:
            response = ask_gpt4o(sys_prompt, user_prompt, username=username)
            start_idx = response.index("{")
            end_idx = response.rindex("}") + 1
            json_content = response[start_idx:end_idx]
            js = json.loads(json_content)
            return js
        except (ValueError, json.JSONDecodeError) as e:
            print('Format error:', e)
            print('New attempt to generate prompts for non-coding task...')
            # If there's a problem, further simplify
            sys_prompt = "You are a prompt generator."
            user_prompt = f"Create a system and user prompt for this task: {subtask['task']}. Format as JSON with sys_prompt and user_prompt keys."
            try:
                response = ask_gpt4o(sys_prompt, user_prompt, username=username)
                start_idx = response.index("{")
                end_idx = response.rindex("}") + 1
                json_content = response[start_idx:end_idx]
                js = json.loads(json_content)
                return js
            except:
                # Simplest fallback option
                return {
                    "sys_prompt": f"You are a domain expert solving this non-coding task: {subtask['task']}",
                    "user_prompt": f"Please answer the following question using plain text only (no code): {subtask['description']}"
                }


# In-memory storage for session subtask data
session_subtasks = {}
# 添加 session 到用户的映射
session_to_user = {}

def save_subtasks_to_session(session_id, subtasks, username=None):
    """Save subtasks to session storage"""
    global session_subtasks, session_to_user
    
    # Use provided session_id if available
    if session_id:
        print(f"Using existing session ID: {session_id}")
    else:
        # Only create new session_id if not provided
        session_id = str(uuid.uuid4())
        print(f"Created new session ID: {session_id}")
    
    session_subtasks[session_id] = subtasks
    
    if username:
        session_to_user[session_id] = username
    
    return session_id

def get_subtasks_from_session(session_id):
    """Get subtasks from session storage, with error handling and logging"""
    global session_subtasks
    if not session_id:
        print(f"Warning: Attempted to get tasks but no session ID provided")
        return []
    if session_id not in session_subtasks:
        print(f"Warning: Session not found: {session_id}")
        return []
    
    subtasks = session_subtasks[session_id]
    print(f"Retrieved {len(subtasks)} subtasks from session {session_id}")
    
    # Validate subtasks
    if not isinstance(subtasks, list):
        print(f"Error: Subtasks in session {session_id} are not a list: {type(subtasks)}")
        return []
    
    return subtasks

def get_username_from_session(session_id):
    """根据 session_id 获取用户名"""
    return session_to_user.get(session_id)

def regenerate_dialogue_content(dialogues_so_far, next_role, next_step, history='', username=None):
    """
    Regenerate dialogue content based on existing dialogues and expected next role/step
    
    Parameters:
    - dialogues_so_far: list of dialogues up to this point
    - next_role: next role (system, user, assistant)
    - next_step: next step name
    - history: additional history information
    - username: username for API key
    
    Returns:
    - newly generated dialogue content
    """
    # Transform existing dialogues into formatted history text
    formatted_history = ""
    for d in dialogues_so_far:
        role_name = "System" if d['role'] == 'system' else "User" if d['role'] == 'user' else "Assistant"
        formatted_history += f"\n{role_name} ({d['step']}):\n{d['content']}\n"
    
    # Determine appropriate prompt based on step type
    prompt_map = {
        # Coding-related steps
        "coding_prompt_generation": "You are a prompt generator, creating a system prompt for a coding task. Based on the previous context, generate a system prompt suitable for coding.",
        "coding_user_prompt": "You are a prompt generator, creating a user prompt for a coding task. Based on the previous context, generate a user prompt to guide code writing.",
        "code_generation": "You are a code generator, needing to generate code based on the previous system and user prompts. Please ensure the code meets the prompt requirements and completes the specified task.",
        "summary_prompt": "You are a code execution summarizer, needing to generate a system prompt to evaluate code execution results.",
        "execution_output": "You are a code execution recorder, needing to format the output of code execution.",
        "execution_summary": "You are an execution result summarizer, needing to concisely summarize the results and effectiveness of code execution.",
        "answer_extraction_prompt": "You are an answer extractor, needing to create a system prompt to extract key information from previous answers.",
        
        # Non-coding steps
        "non_coding_prompt_generation": "You are a prompt generator, creating a system prompt for a non-coding task. Generate a system prompt to guide analysis or evaluation.",
        "non_coding_user_prompt": "You are a prompt generator, creating a user prompt for a non-coding task. Generate a detailed user prompt to guide analysis work.",
        "non_coding_solution": "You are a solution provider, providing a detailed solution or analysis based on previous prompts.",
        "solution_review_prompt": "You are a solution reviewer, needing to create a review prompt to evaluate the quality and completeness of a solution.",
        
        # Default step
        "default": "Based on the previous dialogue context, please continue generating the next dialogue content. Considering the role is '{role}', the step is '{step}', generate an appropriate response."
    }
    
    # Get appropriate prompt template
    template = prompt_map.get(next_step, prompt_map["default"])
    template = template.replace("{role}", next_role).replace("{step}", next_step)
    
    # Build system prompt and user prompt
    sys_prompt = f"You are an AI dialogue regenerator. Your task is to generate the next content for the '{next_role}' role in the '{next_step}' step based on existing dialogues. Ensure the generated content is coherent and logically consistent with existing dialogues."
    user_prompt = f"Here are the existing dialogue contents:\n{formatted_history}\n\nNow, you need to play the '{next_role}' role, generating the next segment in the '{next_step}' step.\n\nPrompt: {template}"
    
    if history:
        sys_prompt += f"\nAdditional history information: {history}"
    
    # Call AI to generate new content
    new_content = ask_gpt4o(sys_prompt, user_prompt, username=username)
    return new_content

# Modify process_subtask function to handle editing content
def process_subtask(main_task, subtasks, subtask_index, subtask, retry=False, reduce_context=True, username=None):
    """Process a single subtask and return results, along with AI dialogue process"""
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    
    # For storing AI dialogue records
    ai_dialogues = []
    
    try:
        if retry:
            if 'edited_content' in subtask:
                edit_msg = f"User-provided modification suggestions: {subtask['edited_content']}"
                subtask['Status'] = f"Retrying with user edits..."
                print(f"Resetting subtask {subtask_index} status and applying user edits")
                print(edit_msg)
            else:
                subtask['Status'] = "Retrying..."
                print(f"Resetting subtask {subtask_index} status to retrying")
        
        # Process based on task type
        if subtask['Type'] == 'Coding':
            code_writer_prompt = generate_prompts_coding(main_task, subtasks, subtask, include_full_context=not reduce_context, username=username)
            print(code_writer_prompt)
            # Record prompt dialogue
            ai_dialogues.append({
                "role": "system",
                "content": code_writer_prompt['sys_prompt'],
                "step": "coding_prompt_generation",
                "needs_review": True,  # Set as editable
                "original_content": code_writer_prompt['sys_prompt']
            })
            ai_dialogues.append({
                "role": "user",
                "content": code_writer_prompt['user_prompt'],
                "step": "coding_user_prompt",
                "needs_review": True,  # Set as editable
                "original_content": code_writer_prompt['user_prompt']
            })
            #print(ai_dialogues)
            # If user edit content is provided, add to prompt
            if 'edited_content' in subtask:
                code_writer_prompt['user_prompt'] += f"\n\nUser-provided modification suggestions or code corrections:\n{subtask['edited_content']}\n\nPlease adjust your code based on the above user suggestions."
                # Delete after processing to avoid reuse
                del subtask['edited_content']
                
            code_writer_prompt['user_prompt'] += """Requirements:
- The generated Python code must be enclosed within ```python and ```.  
- The code block must contain **only one Python code snippet**—do not generate multiple code blocks or any additional non-code content.  
- Do not include any other formatting markers (e.g., ```bash, ```json) that could interfere with the extraction logic(find('```python') and rfind('```'))."""
            history = ''
            attempt = 0
            requirements = ''
            while attempt < 5:
                attempt += 1
                code_writer_prompt['user_prompt'] += requirements
                code_string = ask_gpt4o(code_writer_prompt['sys_prompt'], code_writer_prompt['user_prompt'], history, username=username)
                
                # Record code generation dialogue 
                ai_dialogues.append({
                    "role": "assistant",
                    "content": code_string,
                    "step": "code_generation",
                    "needs_review": True,
                    "original_content": code_string
                })
                
                try:
                    start_index = code_string.find('```python')
                    end_index = code_string.rfind('```')

                    if start_index != -1 and end_index != -1 and start_index < end_index:
                        extracted_code = code_string[start_index + len('```python'):end_index].strip()
                except:
                    raise Exception("No valid code found in the provided string.")
                status = execute_code(extracted_code)
                if status['success'] == True:
                    # The improved version
                    summarizor_sys_prompt = f"""You are a code execution summarizer. A multi-agent system is solving this task:
Task: {subtask['task']}
Description: {subtask['description']}
Expected Output: {subtask.get('Expected Output', 'Not specified')}
Type: {subtask.get('Type', 'Not specified')}

The code writer wrote the following code for this task:
{extracted_code}

You will be provided with the execution output of this code by the user.
Please summarize the execution status of this task. Your summary will provide information for further steps. Be brief, objective, and focused on whether the task was completed successfully."""
                    
                    # Record summary prompt
                    ai_dialogues.append({
                        "role": "system",
                        "content": summarizor_sys_prompt,
                        "step": "summary_prompt",
                        "needs_review": True,
                        "original_content": summarizor_sys_prompt
                    })
                    ai_dialogues.append({
                        "role": "user",
                        "content": f"Code execution output: {status}",
                        "step": "execution_output",
                        "needs_review": True,
                        "original_content": f"Code execution output: {status}"
                    })
                    
                    summary = ask_gpt4o(summarizor_sys_prompt, f"Code execution output: {status}", username=username)
                    
                    # Record summary response
                    ai_dialogues.append({
                        "role": "assistant",
                        "content": summary,
                        "step": "execution_summary",
                        "needs_review": True,
                        "original_content": summary
                    })
                    
                    subtask['Status'] = summary
                    ans_extractor_prompt = f"""You are an answer extraction agent tasked with filtering out the most relevant answer from the previous LLM's response. 
The system is solving the problem: {main_task}. Now you are required to extract the answer for order {subtask['order']}: {subtask['task']} -- {subtask['description']}. The expected output of this task is {subtask["Expected Output"]}.
You will be provided with the full response from the previous LLM, which may contain useful insights, unnecessary analysis, or extra reasoning steps.
Extract only the portion of the previous LLM's response that directly answers the target task.
Exclude any redundant explanations, irrelevant details, or unnecessary reasoning.
Ensure that the extracted answer strictly adheres to the expected output."""

                    # Record answer extraction prompt
                    ai_dialogues.append({
                        "role": "system",
                        "content": ans_extractor_prompt,
                        "step": "answer_extraction_prompt",
                        "needs_review": True,
                        "original_content": ans_extractor_prompt
                    })
                    ai_dialogues.append({
                        "role": "user",
                        "content": code_string,
                        "step": "code_for_extraction",
                        "needs_review": True,
                        "original_content": code_string
                    })
                    
                    extracted_ans = ask_gpt4o(ans_extractor_prompt, code_string, username=username)
                    
                    # Record extracted answer
                    ai_dialogues.append({
                        "role": "assistant",
                        "content": extracted_ans,
                        "step": "extracted_answer",
                        "needs_review": True,
                        "original_content": extracted_ans
                    })
                    
                    subtask["Answer"] = extracted_ans
                    print("*************************")
                    print('Code execution successful!')
                    print(json.dumps(subtask, indent=4))
                    print("*************************")
                    break

                else:
                    issue = 'Error code:\n'+ extracted_code + '\nThe code execution status:\n' + str(status)
                    reviewer_sys_prompt = "You are a code reviewer. You will be provided with a code with error, and the execution result. Please identify whether the issue can be solved by modifying the Python Code. If not, only say 'NO' and do not generate anything else. If this issue can be solved by modifying the Python code, give some advice to the code writer. If the same error had happened before, try to give strct restriction to the code writer to avoid repeated error."
                    
                    # Record code review prompt
                    ai_dialogues.append({
                        "role": "system",
                        "content": reviewer_sys_prompt,
                        "step": "code_review_prompt",
                        "needs_review": True,
                        "original_content": reviewer_sys_prompt
                    })
                    ai_dialogues.append({
                        "role": "user",
                        "content": issue,
                        "step": "error_code_issue",
                        "needs_review": True,
                        "original_content": issue
                    })
                    
                    reviewer_advice = ask_gpt4o(reviewer_sys_prompt, issue, history, username=username)
                    
                    # Record code review advice
                    ai_dialogues.append({
                        "role": "assistant",
                        "content": reviewer_advice,
                        "step": "reviewer_advice",
                        "needs_review": True,
                        "original_content": reviewer_advice
                    })
                    
                    if reviewer_advice == 'NO':
                        issue_log = 'Issue cannot be solved with code modification!\n'+issue
                        print('GPT Summarize:\n', ask_gpt4o('Why the following issue cannot be solved by modifying the Python Code.', issue, history, username=username))
                        print(issue_log)
                        history += issue_log
                        attempt = 5
                    
                    else:
                        history += issue + '\nReviewer Advice:' + reviewer_advice
                        print('Code error. Reviewer is trying to fix it...')
                        print('ERROR CODE START')
                        print(extracted_code)
                        print('ERROR CODE END')
                        print(status)
                        print(reviewer_advice)
                    
                        requirement_adder_prompt = f"""You are a Requirements Adder, responsible for refining and enhancing the prompt for a Code Writer to help them avoid repeating similar mistakes and correctly fix the current issue. You will be provided with the previous prompt for the code writer.
{issue}
Feedback from the Code Reviewer: {reviewer_advice}
Your task is to add new requirements to the original prompt, but you cannot modify the content in the previous prompt. 
Ensure that:
The Code Writer avoids making the same mistake again.
The Code Writer correctly implements the necessary fix.
Please follow the instruction from the code reviewer.
The new requirements are concise, actionable, and specific to the error encountered.
Output Format:

List each new requirement as a separate bullet point, prefixed with -.
Do not generate any other content, explanations, or modifications to the existing prompt—only append the required constraints.

Example:
- You must do ...
- You should never do ...
"""
                        # Record requirement adder prompt
                        ai_dialogues.append({
                            "role": "system",
                            "content": requirement_adder_prompt,
                            "step": "requirement_adder_prompt",
                            "needs_review": True,
                            "original_content": requirement_adder_prompt
                        })
                        ai_dialogues.append({
                            "role": "user",
                            "content": f'The original prompt given to the Code Writer: {code_writer_prompt}',
                            "step": "original_prompt",
                            "needs_review": True,
                            "original_content": f'The original prompt given to the Code Writer: {code_writer_prompt}'
                        })
                        
                        new_requirements = ask_gpt4o(requirement_adder_prompt, f'The original prompt given to the Code Writer: {code_writer_prompt}', username=username)
                        
                        # Record new requirements
                        ai_dialogues.append({
                            "role": "assistant",
                            "content": new_requirements,
                            "step": "new_requirements",
                            "needs_review": True,
                            "original_content": new_requirements
                        })
                        
                        requirements += new_requirements
                
                if attempt == 5:
                    subtask['Status'] = 'Failed' + ask_gpt4o('Summarize the reason of the code execution failure', history, username=username)
                    print('Failed to execute code after multiple attempts.')
        
        elif subtask['Type'] == 'Non-Coding':
            problem_solver_prompt = generate_prompts_non_coding(main_task, subtasks, subtask, include_full_context=not reduce_context, username=username)
            
            # Record prompt dialogue
            ai_dialogues.append({
                "role": "system",
                "content": problem_solver_prompt['sys_prompt'],
                "step": "non_coding_prompt_generation",
                "needs_review": True,
                "original_content": problem_solver_prompt['sys_prompt']
            })
            ai_dialogues.append({
                "role": "user",
                "content": problem_solver_prompt['user_prompt'],
                "step": "non_coding_user_prompt",
                "needs_review": True,
                "original_content": problem_solver_prompt['user_prompt']
            })
            
            # If user edits are provided, add to prompt
            if 'edited_content' in subtask:
                problem_solver_prompt['user_prompt'] += f"\n\nUser-provided modification suggestions or ideas:\n{subtask['edited_content']}\n\nPlease consider the above user suggestions and adjust your answer."
                # Delete after processing to avoid reuse
                del subtask['edited_content']
            
            # Get solution
            solution = ask_gpt4o(problem_solver_prompt['sys_prompt'], problem_solver_prompt['user_prompt'], username=username)
            
            # Record solution
            ai_dialogues.append({
                "role": "assistant",
                "content": solution,
                "step": "non_coding_solution",
                "needs_review": True,
                "original_content": solution
            })
            
            subtask['Status'] = solution
            reviewer_sys_prompt = "You are a subtask reviewer currently evaluating a subtask, which is a step within a larger task. You will be provided with the description of the subtask and a solution process for this subtask. Your role is to thoroughly check this process for any issues. If there are no issues with the process, simply generate 'NO' in uppercase without any additional characters. If issues are present, clearly identify and describe where and what the problems are."
            reviewer_users_prompt = "Subtask Description: " + subtask['task'] + subtask['description'] + 'The solution process to be reviewed: ' + subtask['Status']
            
            # Record review prompt
            ai_dialogues.append({
                "role": "system",
                "content": reviewer_sys_prompt,
                "step": "solution_review_prompt",
                "needs_review": True,
                "original_content": reviewer_sys_prompt
            })
            ai_dialogues.append({
                "role": "user",
                "content": reviewer_users_prompt,
                "step": "solution_for_review",
                "needs_review": True,
                "original_content": reviewer_users_prompt
            })
            
            reviewer_advice = ask_gpt4o(reviewer_sys_prompt, reviewer_users_prompt, username=username)
            
            # Record review opinion
            ai_dialogues.append({
                "role": "assistant",
                "content": reviewer_advice,
                "step": "solution_review",
                "needs_review": True,
                "original_content": reviewer_advice
            })
            
            history = reviewer_users_prompt + 'Reviewer Advice: ' + reviewer_advice
            
            # If there are issues, start review loop
            while reviewer_advice != 'NO':
                print('Bad Answer:', subtask['Status']) 
                print('Reviewer Advice:', reviewer_advice)
                
                # Record revision prompt
                ai_dialogues.append({
                    "role": "system",
                    "content": problem_solver_prompt['sys_prompt'],
                    "step": "solution_revision_prompt",
                    "needs_review": True,
                    "original_content": problem_solver_prompt['sys_prompt']
                })
                ai_dialogues.append({
                    "role": "user", 
                    "content": problem_solver_prompt['user_prompt'] + "\n\nBased on review feedback from previous answer: " + reviewer_advice,
                    "step": "solution_revision_request",
                    "needs_review": True,
                    "original_content": problem_solver_prompt['user_prompt'] + "\n\nBased on review feedback from previous answer: " + reviewer_advice
                })
                
                subtask['Status'] = ask_gpt4o(problem_solver_prompt['sys_prompt'], problem_solver_prompt['user_prompt'], history, username=username)
                
                # Record revised solution
                ai_dialogues.append({
                    "role": "assistant",
                    "content": subtask['Status'],
                    "step": "revised_solution",
                    "needs_review": True,
                    "original_content": subtask['Status']
                })
                
                reviewer_users_prompt = "Subtask Description: " + subtask['task'] + subtask['description'] + 'The solution process to be reviewed: ' + subtask['Status']
                
                # Record new review request
                ai_dialogues.append({
                    "role": "system",
                    "content": reviewer_sys_prompt,
                    "step": "solution_re_review_prompt",
                    "needs_review": True,
                    "original_content": reviewer_sys_prompt
                })
                ai_dialogues.append({
                    "role": "user",
                    "content": reviewer_users_prompt,
                    "step": "solution_for_re_review",
                    "needs_review": True,
                    "original_content": reviewer_users_prompt
                })
                
                reviewer_advice = ask_gpt4o(reviewer_sys_prompt, reviewer_users_prompt, username=username)
                
                # Record new review opinion
                ai_dialogues.append({
                    "role": "assistant",
                    "content": reviewer_advice,
                    "step": "solution_re_review",
                    "needs_review": True,
                    "original_content": reviewer_advice
                })
                
                history +=  'Modified Process: ' + subtask['Status'] + 'Reviewer Advice: ' + reviewer_advice
            
            # Extract final answer
            ans_extractor_prompt = f"""You are an answer extraction agent tasked with filtering out the most relevant answer from the previous LLM's response. 
The system is solving the problem: {main_task}. Now you are required to extract the answer for order {subtask['order']}: {subtask['task']} -- {subtask['description']}. The expected output of this task is {subtask["Expected Output"]}.
You will be provided with the full response from the previous LLM, which may contain useful insights, unnecessary analysis, or extra reasoning steps.
Extract only the portion of the previous LLM's response that directly answers the target task.
Exclude any redundant explanations, irrelevant details, or unnecessary reasoning.
Ensure that the extracted answer strictly adheres to the expected output."""
            
            # Record answer extraction prompt
            ai_dialogues.append({
                "role": "system",
                "content": ans_extractor_prompt,
                "step": "answer_extraction_prompt",
                "needs_review": True,
                "original_content": ans_extractor_prompt
            })
            ai_dialogues.append({
                "role": "user",
                "content": subtask['Status'],
                "step": "solution_for_extraction",
                "needs_review": True,
                "original_content": subtask['Status']
            })
            
            extracted_ans = ask_gpt4o(ans_extractor_prompt, subtask['Status'], username=username)
            
            # Record extracted answer
            ai_dialogues.append({
                "role": "assistant",
                "content": extracted_ans,
                "step": "extracted_answer",
                "needs_review": True,
                "original_content": extracted_ans
            })
            
            subtask["Answer"] = extracted_ans
            print(json.dumps(subtask, indent=4))
        
        elif subtask['Type'] == 'Read-Only':
            reader_prompt = 'You are a file reader. You will be provided with a task, which needs to read some files. You have no need to solve it, but only to read the files. The only thing you need to do is to generate Python code to read the file, and print everything in the file.'
            
            # Record file reading prompt
            ai_dialogues.append({
                "role": "system",
                "content": reader_prompt,
                "step": "file_reading_prompt",
                "needs_review": True,
                "original_content": reader_prompt
            })
            ai_dialogues.append({
                "role": "user",
                "content": str(subtask),
                "step": "file_reading_task",
                "needs_review": True,
                "original_content": str(subtask)
            })
            
            # If user edits are provided, add to prompt
            if 'edited_content' in subtask:
                reader_prompt += f"\n\nUser-provided modification suggestions:\n{subtask['edited_content']}\n\nPlease consider the user's suggestions and adjust your code accordingly."
                # Delete after processing to avoid reuse
                del subtask['edited_content']
            
            code_string = ask_gpt4o(reader_prompt, str(subtask), username=username)
            
            # Record file reading code generation
            ai_dialogues.append({
                "role": "assistant",
                "content": code_string,
                "step": "file_reading_code",
                "needs_review": True,
                "original_content": code_string
            })
            
            start_index = code_string.find('```python')
            end_index = code_string.rfind('```')
            if start_index != -1 and end_index != -1 and start_index < end_index:
                extracted_code = code_string[start_index + len('```python'):end_index].strip()
                status = execute_code(extracted_code)
                print('File Reading Success')
                
                # Record file reading result
                ai_dialogues.append({
                    "role": "system",
                    "content": "File content read successfully",
                    "step": "file_reading_result",
                    "needs_review": True,
                    "original_content": "File content read successfully"
                })
                ai_dialogues.append({
                    "role": "user",
                    "content": "File content: " + status['output'],
                    "step": "file_content",
                    "needs_review": True,
                    "original_content": "File content: " + status['output']
                })
            else:
                raise Exception('File Reader Code Generation Failed.')

            problem_solver_prompt = generate_prompts_non_coding(main_task, subtasks, subtask, include_full_context=not reduce_context, username=username)
            
            # Record problem solving prompt
            ai_dialogues.append({
                "role": "system",
                "content": problem_solver_prompt['sys_prompt'],
                "step": "read_only_prompt_generation",
                "needs_review": True,
                "original_content": problem_solver_prompt['sys_prompt']
            })
            ai_dialogues.append({
                "role": "user",
                "content": problem_solver_prompt['user_prompt'] + 'The content of the file: ' + status['output'],
                "step": "read_only_user_prompt",
                "needs_review": True,
                "original_content": problem_solver_prompt['user_prompt'] + 'The content of the file: ' + status['output']
            })
            
            subtask['Status'] = ask_gpt4o(problem_solver_prompt['sys_prompt'], problem_solver_prompt['user_prompt'] + 'The content of the file: ' + status['output'], username=username)
            
            # Record solution
            ai_dialogues.append({
                "role": "assistant",
                "content": subtask['Status'],
                "step": "read_only_solution",
                "needs_review": True,
                "original_content": subtask['Status']
            })
            
            reviewer_sys_prompt = "You are a subtask reviewer currently evaluating a subtask, which is a step within a larger task. You will be provided with the description of the subtask and a solution process for this subtask. Your role is to thoroughly check this process for any issues. If there are no issues with the process, simply generate 'NO' in uppercase without any additional characters. If issues are present, clearly identify and describe where and what the problems are."
            reviewer_users_prompt = "Subtask Description: " + subtask['task'] + 'The content of the file: ' + status['output'] + subtask['description'] + 'The solution process to be reviewed: ' + subtask['Status']
            
            # Record review prompt
            ai_dialogues.append({
                "role": "system",
                "content": reviewer_sys_prompt,
                "step": "read_only_review_prompt",
                "needs_review": True,
                "original_content": reviewer_sys_prompt
            })
            ai_dialogues.append({
                "role": "user",
                "content": reviewer_users_prompt,
                "step": "read_only_for_review",
                "needs_review": True,
                "original_content": reviewer_users_prompt
            })
            
            reviewer_advice = ask_gpt4o(reviewer_sys_prompt, reviewer_users_prompt, username=username)
            
            # Record review opinion
            ai_dialogues.append({
                "role": "assistant",
                "content": reviewer_advice,
                "step": "read_only_review",
                "needs_review": True,
                "original_content": reviewer_advice
            })
            
            history = reviewer_users_prompt + 'Reviewer Advice: ' + reviewer_advice
            
            # If there are issues, start review loop
            while reviewer_advice != 'NO':
                print('$$$$$$$$$$')
                print('Bad Answer:', subtask['Status']) 
                print('$$$$$$$$$$')
                print('Reviewer Advice:', reviewer_advice)
                
                # Record revision prompt
                ai_dialogues.append({
                    "role": "system",
                    "content": problem_solver_prompt['sys_prompt'],
                    "step": "read_only_revision_prompt",
                    "needs_review": True,
                    "original_content": problem_solver_prompt['sys_prompt']
                })
                ai_dialogues.append({
                    "role": "user",
                    "content": problem_solver_prompt['user_prompt'] + "\n\nFile content: " + status['output'] + "\n\nBased on review feedback from previous answer: " + reviewer_advice,
                    "step": "read_only_revision_request",
                    "needs_review": True,
                    "original_content": problem_solver_prompt['user_prompt'] + "\n\nFile content: " + status['output'] + "\n\nBased on review feedback from previous answer: " + reviewer_advice
                })
                
                subtask['Status'] = ask_gpt4o(problem_solver_prompt['sys_prompt'], problem_solver_prompt['user_prompt'], history, username=username)
                
                # Record revised solution
                ai_dialogues.append({
                    "role": "assistant",
                    "content": subtask['Status'],
                    "step": "read_only_revised_solution",
                    "needs_review": True,
                    "original_content": subtask['Status']
                })
                
                reviewer_users_prompt = "Subtask Description: " + subtask['task'] + subtask['description'] + 'The solution process to be reviewed: ' + subtask['Status']
                
                # Record new review request
                ai_dialogues.append({
                    "role": "system",
                    "content": reviewer_sys_prompt,
                    "step": "read_only_re_review_prompt",
                    "needs_review": True,
                    "original_content": reviewer_sys_prompt
                })
                ai_dialogues.append({
                    "role": "user",
                    "content": reviewer_users_prompt,
                    "step": "read_only_for_re_review",
                    "needs_review": True,
                    "original_content": reviewer_users_prompt
                })
                
                reviewer_advice = ask_gpt4o(reviewer_sys_prompt, reviewer_users_prompt, username=username)
                
                # Record new review opinion
                ai_dialogues.append({
                    "role": "assistant",
                    "content": reviewer_advice,
                    "step": "read_only_re_review",
                    "needs_review": True,
                    "original_content": reviewer_advice
                })
                
                history +=  'Modified Process: ' + subtask['Status'] + 'Reviewer Advice: ' + reviewer_advice
            
            # Extract final answer
            ans_extractor_prompt = f"""You are an answer extraction agent tasked with filtering out the most relevant answer from the previous LLM's response. 
The system is solving the problem: {main_task}. Now you are required to extract the answer for order {subtask['order']}: {subtask['task']} -- {subtask['description']}. The expected output of this task is {subtask["Expected Output"]}.
You will be provided with the full response from the previous LLM, which may contain useful insights, unnecessary analysis, or extra reasoning steps.
Extract only the portion of the previous LLM's response that directly answers the target task.
Exclude any redundant explanations, irrelevant details, or unnecessary reasoning.
Ensure that the extracted answer strictly adheres to the expected output."""
            
            # Record answer extraction prompt
            ai_dialogues.append({
                "role": "system",
                "content": ans_extractor_prompt,
                "step": "read_only_extraction_prompt",
                "needs_review": True,
                "original_content": ans_extractor_prompt
            })
            ai_dialogues.append({
                "role": "user",
                "content": subtask['Status'],
                "step": "read_only_for_extraction",
                "needs_review": True,
                "original_content": subtask['Status']
            })
            
            extracted_ans = ask_gpt4o(ans_extractor_prompt, subtask['Status'], username=username)
            
            # Record extracted answer
            ai_dialogues.append({
                "role": "assistant",
                "content": extracted_ans,
                "step": "read_only_extracted_answer",
                "needs_review": True,
                "original_content": extracted_ans
            })
            
            subtask["Answer"] = extracted_ans
            print(json.dumps(subtask, indent=4))
        else:
            print('Unknown Type:', subtask['Type'])
        
        # Ensure AI dialogues are attached to the subtask
        subtask['ai_dialogues'] = ai_dialogues
        
        # Get the output and restore stdout
        output = sys.stdout.getvalue()
        sys.stdout = old_stdout
        
        return subtask, output, ai_dialogues
    
    except Exception as e:
        error_detail = traceback.format_exc()
        print(f"Error in process_subtask ({subtask_index}): {str(e)}")
        print(f"Traceback: {error_detail}")
        
        # Get the partial output
        output = sys.stdout.getvalue()
        
        # Restore stdout
        sys.stdout = old_stdout
        
        # Re-raise the exception with more context
        raise Exception(f"Error processing subtask {subtask_index} ({subtask.get('task', 'unknown')}): {str(e)}")

# Fix the indentation error in the regenerate_dialogues function
def extract_code_from_markdown(markdown_content):
    """Extract code blocks from markdown formatted content"""
    if not markdown_content:
        return None
        
    # Look for code between ```python and ```
    code_pattern = r'```python\s*(.*?)\s*```'
    matches = re.findall(code_pattern, markdown_content, re.DOTALL)
    
    if matches:
        return matches[0].strip()
    
    # If no explicit python code block, try to find other code blocks
    generic_code_pattern = r'```\s*(.*?)\s*```'
    matches = re.findall(generic_code_pattern, markdown_content, re.DOTALL)
    
    if matches:
        return matches[0].strip()
        
    return None

# Determine if a task should be re-executed based on dialogue changes
def should_reexecute_task(subtask, dialogue_index, dialogues):
    """Determine if task needs to be re-executed based on dialogue edits"""
    # Always re-execute coding tasks when dialogues are edited
    if subtask.get('Type') == 'Coding':
        # Check if the edited dialogue is significant for code generation
        significant_steps = ['coding_prompt_generation', 'coding_user_prompt', 
                            'code_generation', 'code_review_prompt']
        
        # If the edited dialogue is in a significant step
        if dialogue_index < len(dialogues) and dialogues[dialogue_index].get('step') in significant_steps:
            return True
    
    # For non-coding tasks, re-execute if the dialogue affects the final answer
    elif subtask.get('Type') in ['Non-Coding', 'Read-Only']:
        # Check if the edited dialogue is related to the solution
        solution_steps = ['non_coding_prompt_generation', 'non_coding_user_prompt',
                         'non_coding_solution', 'read_only_solution']
        
        if dialogue_index < len(dialogues) and dialogues[dialogue_index].get('step') in solution_steps:
            return True
    
    # By default, don't re-execute unless necessary
    return False

# Re-execute a task based on updated dialogues
def reexecute_task_with_dialogues(subtask, updated_dialogues):
    """Re-execute a task based on updated dialogues"""
    if subtask.get('Type') == 'Coding':
        # Extract code from the dialogues
        code_content = None
        for dialogue in updated_dialogues:
            if dialogue.get('step') == 'code_generation':
                code_content = extract_code_from_markdown(dialogue.get('content', ''))
                break
        
        if not code_content:
            print("Cannot extract code from dialogues, unable to re-execute")
            return None
            
        # Execute the extracted code
        try:
            print(f"Re-executing extracted code: {len(code_content)} characters")
            execution_result = execute_code(code_content)
            
            # Update the subtask with execution results
            updated_subtask = subtask.copy()
            
            if execution_result.get('success'):
                # Successfully executed
                updated_subtask['Status'] = f"Code execution successful. Output: {execution_result.get('output', '')}"
                
                # Extract file output if this task was supposed to write to a file
                if 'output.txt' in code_content or 'file' in subtask.get('description', '').lower():
                    # Check for common file operations in the code
                    file_patterns = [
                        r'open\([\'"]([^\'"]+)[\'"]', # open("filename")
                        r'with\s+open\([\'"]([^\'"]+)[\'"]', # with open("filename")
                        r'writeFile\([\'"]([^\'"]+)[\'"]', # writeFile("filename")
                        r'fs\.writeFile\([\'"]([^\'"]+)[\'"]', # fs.writeFile("filename")
                    ]
                    
                    potential_files = []
                    for pattern in file_patterns:
                        matches = re.findall(pattern, code_content)
                        potential_files.extend(matches)
                    
                    # Try to read the files that might have been created
                    for filename in potential_files:
                        try:
                            # Check if it's an absolute path or relative
                            if not os.path.isabs(filename):
                                # Try different common locations
                                for path in ['./', './temp/', '/tmp/']:
                                    full_path = os.path.join(path, filename)
                                    if os.path.exists(full_path):
                                        with open(full_path, 'r') as file:
                                            file_content = file.read()
                                            updated_subtask['file_output'] = file_content
                                            print(f"Read {len(file_content)} characters from file {full_path}")
                                            break
                        except Exception as file_error:
                            print(f"Failed to read file {filename}: {str(file_error)}")
            else:
                # Execution failed
                updated_subtask['Status'] = f"Code execution failed: {execution_result.get('error_message', '')}"
            
            return updated_subtask
            
        except Exception as exec_error:
            print(f"Failed to re-execute code: {str(exec_error)}")
            return None
            
    elif subtask.get('Type') in ['Non-Coding', 'Read-Only']:
        # For non-coding tasks, extract the updated solution
        solution = None
        for dialogue in reversed(updated_dialogues):
            if dialogue.get('step') in ['non_coding_solution', 'read_only_solution', 'extracted_answer']:
                solution = dialogue.get('content')
                break
                
        if solution:
            updated_subtask = subtask.copy()
            updated_subtask['Status'] = solution
            updated_subtask['Answer'] = solution
            return updated_subtask
    
    return None

@app.route('/regenerate-dialogues', methods=['POST'])
def regenerate_dialogues():
    """Regenerate subsequent dialogues from a specific dialogue index and ensure execution update"""
    data = request.json
    session_id = data.get('session_id')
    task_index = data.get('task_index')
    dialogue_index = data.get('dialogue_index')
    updated_content = data.get('updated_content')
    current_dialogues = data.get('current_dialogues')  # Get current dialogues from frontend
    
    # 从 session 获取用户名
    username = get_username_from_session(session_id)
    
    print(f"Regenerate dialogues request details:")
    print(f"- session_id: {session_id}")
    print(f"- task_index: {task_index}")
    print(f"- dialogue_index: {dialogue_index}")
    print(f"- updated_content length: {len(updated_content) if updated_content else 0}")
    print(f"- current_dialogues provided: {current_dialogues is not None}")
    print(f"- username: {username}")
    
    # Parameter validation
    if not all([session_id, task_index is not None, dialogue_index is not None, updated_content]):
        missing_params = []
        if not session_id:
            missing_params.append("session_id")
        if task_index is None:
            missing_params.append("task_index")
        if dialogue_index is None:
            missing_params.append("dialogue_index")
        if not updated_content:
            missing_params.append("updated_content")
            
        error_msg = f"Missing required parameters: {', '.join(missing_params)}"
        print(f"Validation failed: {error_msg}")
        return jsonify({'error': error_msg}), 400
    
    try:
        # Ensure indices are integers
        task_index = int(task_index)
        dialogue_index = int(dialogue_index)
        
        # Get subtasks from session
        subtasks = get_subtasks_from_session(session_id)
        if not subtasks:
            return jsonify({'error': f'Invalid session ID: {session_id}'}), 400
        
        if task_index >= len(subtasks):
            return jsonify({'error': f'Invalid task index: {task_index}, max: {len(subtasks)-1}'}), 400
            
        # Print current subtask content - for debugging
        print(f"Subtask {task_index} content: {json.dumps(subtasks[task_index], ensure_ascii=False, default=str)[:500]}...")
        
        # Ensure task has dialogue records
        if 'ai_dialogues' not in subtasks[task_index]:
            # If frontend provided current dialogues, use them
            if current_dialogues:
                print(f"Task {task_index} has no dialogue records, but frontend provided current dialogue data, using frontend data")
                subtasks[task_index]['ai_dialogues'] = current_dialogues
                # Save updated subtasks
                save_subtasks_to_session(session_id, subtasks, username)
            # If no dialogue records but task has been executed, create dialogue records for this task
            elif subtasks[task_index].get('Status') and subtasks[task_index].get('Status') != 'Not yet started...':
                print(f"Task {task_index} has no dialogue records but has been executed. Attempting to re-process to generate dialogue records.")
                try:
                    # Reprocess subtask to generate dialogue records
                    subtask, output, ai_dialogues = process_subtask(
                        subtasks[task_index].get('main_task', "Task unknown"),  # Provide a default
                        subtasks, 
                        task_index, 
                        subtasks[task_index], 
                        retry=True,
                        username=username
                    )
                    
                    # Update subtask dialogue records
                    subtasks[task_index]['ai_dialogues'] = ai_dialogues
                    # Save updated subtasks
                    save_subtasks_to_session(session_id, subtasks, username)
                except Exception as process_error:
                    print(f"Failed to reprocess subtask: {str(process_error)}")
                    # If reprocessing fails, but frontend provided dialogues, use frontend dialogues
                    if current_dialogues:
                        subtasks[task_index]['ai_dialogues'] = current_dialogues
                        save_subtasks_to_session(session_id, subtasks, username)
                    else:
                        return jsonify({'error': f'Cannot regenerate dialogue records for task {task_index}: {str(process_error)}'}), 400
            else:
                return jsonify({'error': f'Task {task_index} has no dialogue records, please execute task first'}), 400
        
        ai_dialogues = subtasks[task_index]['ai_dialogues']
        if dialogue_index >= len(ai_dialogues):
            return jsonify({'error': f'Invalid dialogue index: {dialogue_index}, max: {len(ai_dialogues)-1}'}), 400
        
        # Update current dialogue content
        ai_dialogues[dialogue_index]['content'] = updated_content
        ai_dialogues[dialogue_index]['isEdited'] = True
        
        # Record user edits
        if 'user_edited_dialogues' not in subtasks[task_index]:
            subtasks[task_index]['user_edited_dialogues'] = {}
        
        subtasks[task_index]['user_edited_dialogues'][str(dialogue_index)] = updated_content
        
        # Get dialogue context for regenerating subsequent dialogues
        context_dialogues = ai_dialogues[:dialogue_index+1]
        
        # For regenerating dialogues, we need to build a new context
        new_dialogues = context_dialogues.copy()
        
        # Determine next dialogue based on step and role
        next_dialogue_index = dialogue_index + 1
        
        # Check what role the current dialogue is, determine what the next role should be
        current_role = ai_dialogues[dialogue_index]['role']
        current_step = ai_dialogues[dialogue_index]['step']
        
        # If we have enough information to infer what the next step should be
        if next_dialogue_index < len(ai_dialogues):
            # Regenerate subsequent dialogues
            for i in range(next_dialogue_index, len(ai_dialogues)):
                role = ai_dialogues[i]['role']
                step = ai_dialogues[i]['step']
                
                try:
                    # Use enhanced dialogue regeneration logic
                    new_content = regenerate_dialogue_content(
                        new_dialogues, 
                        role, 
                        step,
                        history=f"Original content: {ai_dialogues[i].get('original_content', '')}",
                        username=username
                    )
                    
                    # Create new dialogue message
                    new_dialogue = {
                        'role': role,
                        'content': new_content,
                        'step': step,
                        'needs_review': True,
                        'original_content': ai_dialogues[i].get('original_content', '')
                    }
                    
                    new_dialogues.append(new_dialogue)
                except Exception as dialogue_error:
                    print(f"Failed to regenerate dialogue content (index {i}): {str(dialogue_error)}")
                    # If generation fails, use original dialogue content
                    new_dialogues.append(ai_dialogues[i])
        
        # Update subtask status and answer
        try:
            for dialogue in reversed(new_dialogues):
                if dialogue['step'] in ['execution_summary', 'extracted_answer', 'read_only_extracted_answer']:
                    # Update subtask status
                    subtasks[task_index]['Status'] = dialogue['content']
                    break
            
            # Find answer extraction result
            for dialogue in reversed(new_dialogues):
                if dialogue['step'] in ['extracted_answer', 'read_only_extracted_answer']:
                    # Update subtask answer
                    subtasks[task_index]['Answer'] = dialogue['content']
                    break
                    
            # Find code generation or non-coding task key dialogues
            code_content = None
            for dialogue in new_dialogues:
                # For coding tasks, find the code generation step
                if dialogue['step'] == 'code_generation':
                    # Extract code from markdown code blocks
                    code_content = extract_code_from_markdown(dialogue['content'])
                    # Store the extracted code for task execution
                    subtasks[task_index]['extracted_code'] = code_content
                    print(f"Extracted code from dialogue: {len(code_content) if code_content else 0} characters")
                    break
                    
            # If this task needs to be re-executed with the updated dialogues
            needs_reexecution = should_reexecute_task(subtasks[task_index], dialogue_index, ai_dialogues)
            
            if needs_reexecution:
                print(f"Detected dialogue modification requires task {task_index} re-execution")
                # Re-execute the task with the updated dialogues
                updated_subtask = reexecute_task_with_dialogues(subtasks[task_index], new_dialogues)
                
                # Update the subtask with the re-execution results
                if updated_subtask:
                    # Update necessary fields while preserving dialogues
                    subtasks[task_index]['Status'] = updated_subtask.get('Status', subtasks[task_index]['Status'])
                    subtasks[task_index]['Answer'] = updated_subtask.get('Answer', subtasks[task_index]['Answer'])
                    
                    # If file output was generated, update that too
                    if 'file_output' in updated_subtask:
                        subtasks[task_index]['file_output'] = updated_subtask['file_output']
                        print(f"Updated task {task_index} file output")
                        
                    print(f"Re-executed task {task_index} based on modified dialogues")
        except Exception as status_error:
            print(f"Failed to update task status or answer: {str(status_error)}")
                
        # Replace original dialogues with newly generated ones
        subtasks[task_index]['ai_dialogues'] = new_dialogues
        
        # Save updated subtasks
        save_subtasks_to_session(session_id, subtasks, username)
        
        # Return updated dialogues
        return jsonify({
            'success': True,
            'message': 'Dialogues regenerated',
            'ai_dialogues': new_dialogues,
            'task_index': task_index,
            'session_id': session_id,
            'subtask': subtasks[task_index]  # Return updated subtask
        })
    
    except Exception as e:
        error_detail = traceback.format_exc()
        print(f"Error regenerating dialogues: {str(e)}\n{error_detail}")
        
        return jsonify({
            'error': str(e), 
            'detail': error_detail
        }), 500

# Modified process_task function to support edit content parameter and handle rate limiting
@app.route('/process-task', methods=['POST'])
def process_task():
    data = request.json
    main_task = data.get('main_task')
    continue_from = data.get('continue_from', 0)  # Which task to continue from
    retry_task = data.get('retry_task')  # Task index to retry
    session_id = data.get('session_id')  # Get session ID
    edit_content = data.get('edit_content')  # Get edit content
    task_index = data.get('task_index')  # Task index
    edited_subtasks = data.get('edited_subtasks')  # Get edited subtasks
    username = data.get('username')  # 获取用户名
    
    # Enhanced logging
    print(f"[API] /process-task received request: ")
    print(f"- main_task: '{main_task[:50] if main_task else None}...' ({len(main_task) if main_task else 0} chars)")
    print(f"- continue_from: {continue_from}")
    print(f"- retry_task: {retry_task}")
    print(f"- session_id: {session_id}")
    print(f"- task_index: {task_index}")
    print(f"- edit_content: {'Present' if edit_content else 'None'}")
    print(f"- edited_subtasks: {'Present' if edited_subtasks else 'None'}")
    print(f"- username: {username}")
    
    if not main_task:
        return jsonify({'error': 'Main task is required'}), 400
        
    # Check if using streaming response - use streaming for initial request, regular for subsequent
    use_streaming = True
    
    # For continue execution, retry task, edit task, or save edited subtasks, use non-streaming
    if continue_from > 0 or retry_task is not None or edit_content is not None or edited_subtasks is not None:
        use_streaming = False
    
    # If using streaming response
    if use_streaming:
        return Response(stream_response(data), mimetype='text/event-stream')
    else:
        # Non-streaming processing - return JSON directly
        try:
            # Redirect stdout to capture output
            old_stdout = sys.stdout
            sys.stdout = io.StringIO()
            
            print(f"Processing task: {main_task}")
            print(f"Session ID: {session_id}")
            print(f"Continue index: {continue_from}")
            print(f"Retry index: {retry_task}")
            print(f"Edit content length: {len(edit_content) if edit_content else 0}")
            print(f"Edited subtasks: {True if edited_subtasks else False}")
            print(f"Username: {username}")
            
            # If first execution, split the task
            if continue_from == 0 and retry_task is None and edit_content is None and edited_subtasks is None:
                subtasks = split_main_task(main_task, username=username)
                session_id = save_subtasks_to_session(session_id, subtasks, username)
                print(f"Saved initial subtasks to session: {session_id}")
            elif edited_subtasks is not None:
                # If edited subtasks provided, save them
                session_id = save_subtasks_to_session(session_id, edited_subtasks, username)
                print(f"Saved edited subtasks to session: {session_id}")
                # Return session info directly without executing any subtasks
                return jsonify({
                    'message': 'Edited subtasks saved successfully',
                    'session_id': session_id,
                    'all_subtasks': edited_subtasks
                })
            else:
                # Get previous subtasks from session
                subtasks = get_subtasks_from_session(session_id)
                if not subtasks:
                    print(f"Warning: Session data not found {session_id}")
                    return jsonify({'error': 'Session not found or expired'}), 404
                print(f"Retrieved {len(subtasks)} subtasks from session {session_id}")
                
                # 如果没有用户名，尝试从 session 获取
                if not username:
                    username = get_username_from_session(session_id)
            
            # Determine starting index
            if retry_task is not None:
                start_idx = retry_task
            elif task_index is not None and edit_content is not None:
                start_idx = task_index
            else:
                start_idx = continue_from
                
            print(f"Processing subtask index: {start_idx}")
            
            if start_idx >= len(subtasks):
                return jsonify({'error': 'Invalid task index'}), 400
                
            subtask = subtasks[start_idx]
            
            # If edit content provided, add to subtask status
            if edit_content:
                print(f"Received edit content: {edit_content[:100]}...")
                subtask['edited_content'] = edit_content
            
            # Process subtask - add exception handling
            try:
                is_retry = retry_task is not None or edit_content is not None
                subtask, output, ai_dialogues = process_subtask(
                    main_task, subtasks, start_idx, subtask, 
                    retry=is_retry, reduce_context=True, username=username
                )
            except Exception as subtask_error:
                error_str = str(subtask_error)
                print(f"Error processing subtask {start_idx}: {error_str}")
                
                # Special handling for rate limit errors
                if "rate_limit" in error_str.lower() or "429" in error_str:
                    # Try to extract suggested wait time from error message
                    retry_time = 60  # Default 60 seconds
                    try:
                        # Try to match retry time
                        retry_match = re.search(r'please retry after (\d+)', error_str.lower())
                        if retry_match:
                            retry_time = int(retry_match.group(1))
                    except:
                        pass
                    
                    return jsonify({
                        'error': 'OpenAI API rate limit exceeded',
                        'message': 'Request too large or too many requests in short time',
                        'retry_after': retry_time,
                        'subtask_index': start_idx
                    }), 429
                
                # For other errors, return detailed error info
                trace_detail = traceback.format_exc()
                
                return jsonify({
                    'error': f'Error processing subtask {start_idx}: {error_str}',
                    'traceback': trace_detail,
                    'task_index': start_idx
                }), 500
            
            # Determine if this is the last task
            is_last_task = start_idx >= len(subtasks) - 1
            
            # Create response data
            response_data = {
                'subtask': subtask,
                'output': output,
                'task_index': start_idx,
                'total_tasks': len(subtasks),
                'waiting_user_action': not is_last_task,
                'is_final_task': is_last_task,  # Add flag for final task
                'session_id': session_id,
                'ai_dialogues': ai_dialogues  # Add AI dialogue records
            }
            
            # Save updated state
            save_subtasks_to_session(session_id, subtasks, username)
            
            # Get and restore stdout
            debug_output = sys.stdout.getvalue()
            sys.stdout = old_stdout
            print(f"Non-streaming processing result: {debug_output[:500]}...")
            
            return jsonify(response_data)
            
        except Exception as e:
            error_message = traceback.format_exc()
            print(f"Error processing task: {error_message}")
            
            # Check if rate limit error
            if "rate_limit" in str(e).lower() or "429" in str(e).lower():
                return jsonify({
                    'error': 'OpenAI API rate limit exceeded',
                    'message': 'Request too large or too many requests in short time',
                    'retry_after': 60,
                    'details': str(e)
                }), 429
                
            return jsonify({'error': error_message}), 500

def stream_response(data):
    """Streaming response generator"""
    main_task = data.get('main_task')
    continue_from = data.get('continue_from', 0)
    retry_task = data.get('retry_task')
    session_id = data.get('session_id')
    username = data.get('username')  # 获取用户名
    
    try:
        # Redirect stdout to capture output
        old_stdout = sys.stdout
        sys.stdout = io.StringIO()
        
        # Print session-related info (for debugging)
        print(f"Processing task: {main_task}")
        print(f"Session ID: {session_id}")
        print(f"Continue index: {continue_from}")
        print(f"Retry index: {retry_task}")
        print(f"Username: {username}")
        
        # If first execution, split the task
        if continue_from == 0 and retry_task is None:
            subtasks = split_main_task(main_task, username=username)
            # Save newly generated subtasks and get new session ID
            session_id = save_subtasks_to_session(session_id, subtasks, username)
            print(f"Saved initial subtasks to session: {session_id}")
            
            # Send initial response with all subtasks
            initial_response = {
                'all_subtasks': subtasks,
                'session_id': session_id,
                'is_initial_response': True
            }
            
            # Send JSON formatted response with data: prefix
            yield f"data: {json.dumps(initial_response)}\n\n"
            
            # If streaming response for initial request, don't immediately execute first subtask
            print(f"Sent initial subtask list, waiting for user confirmation")
            return
        else:
            # Get previous subtasks from session
            session_id = data.get('session_id')
            subtasks = get_subtasks_from_session(session_id)
            if not subtasks:
                print(f"Warning: Session data not found {session_id}")
                yield f"data: {json.dumps({'error': 'Session not found or expired'})}\n\n"
                return
            print(f"Retrieved {len(subtasks)} subtasks from session {session_id}")
            
            # 如果没有用户名，尝试从 session 获取
            if not username:
                username = get_username_from_session(session_id)
        
        # Determine starting index
        start_idx = continue_from if retry_task is None else retry_task
        print(f"Starting to process subtask index: {start_idx}")
        
        for i in range(start_idx, len(subtasks)):
            sys.stdout = io.StringIO()
            print('------',i+1,'------')
            subtask = subtasks[i]
            
            # If retrying task, reset task status
            if i == retry_task:
                subtask['Status'] = "Retrying..."
                print(f"Reset subtask {i} status to retrying")
            
            # Process subtask - add exception handling
            try:
                subtask, output, ai_dialogues = process_subtask(
                    main_task, subtasks, i, subtask, 
                    retry=(i == retry_task), reduce_context=True, username=username
                )
            except Exception as subtask_error:
                error_str = str(subtask_error)
                print(f"Error processing subtask {i}: {error_str}")
                
                # Handle rate limit errors
                if "rate_limit" in error_str.lower() or "429" in error_str:
                    # Send rate limit error response
                    error_response = {
                        'error': 'OpenAI API rate limit exceeded',
                        'message': 'Request too large or too many requests in short time',
                        'retry_after': 60,
                        'subtask_index': i
                    }
                    yield f"data: {json.dumps(error_response)}\n\n"
                    return
                
                # For other errors
                trace_detail = traceback.format_exc()
                error_response = {
                    'error': f'Error processing subtask {i}: {error_str}',
                    'traceback': trace_detail,
                    'task_index': i
                }
                yield f"data: {json.dumps(error_response)}\n\n"
                return
            
            # Add wait for user action flag and session ID
            response_data = {
                'subtask': subtask,
                'output': output,
                'task_index': i,
                'total_tasks': len(subtasks),
                'waiting_user_action': i < len(subtasks) - 1,
                'session_id': session_id,
                'ai_dialogues': ai_dialogues  # Add AI dialogue records
            }
            
            # Save updated subtask state
            save_subtasks_to_session(session_id, subtasks, username)
            
            print(f"Sending subtask {i} response")
            
            # Ensure response is valid JSON and add data: prefix
            response_json = json.dumps(response_data)
            yield f"data: {response_json}\n\n"
            
            # If not the last task, wait for user action
            if i < len(subtasks) - 1:
                print(f"Waiting for user action on subtask {i}")
                break
        
        # Send end signal after all tasks complete
        yield f"data: END\n\n"
                
    except Exception as e:
        error_message = traceback.format_exc()
        print(f"Error processing task: {error_message}")
        
        # Check if rate limit error
        if "rate_limit" in str(e).lower() or "429" in str(e).lower():
            error_response = {
                'error': 'OpenAI API rate limit exceeded',
                'message': 'Request too large or too many requests in short time',
                'retry_after': 60
            }
        else:
            error_response = {'error': error_message}
            
        yield f"data: {json.dumps(error_response)}\n\n"

@app.route('/update-ai-dialogue', methods=['POST'])
def update_ai_dialogue():
    data = request.json
    session_id = data.get('session_id')
    task_index = data.get('task_index')
    dialogue_index = data.get('dialogue_index')
    updated_content = data.get('updated_content')
    
    print(f"Received AI dialogue update request details:")
    print(f"- session_id: {session_id}")
    print(f"- task_index: {task_index}")
    print(f"- dialogue_index: {dialogue_index}")
    print(f"- updated_content length: {len(updated_content) if updated_content else 0}")
    
    # Parameter validation
    if not session_id:
        return jsonify({'error': 'Missing session_id'}), 400
    
    if task_index is None:
        return jsonify({'error': 'Missing task_index'}), 400
    
    if dialogue_index is None:
        return jsonify({'error': 'Missing dialogue_index'}), 400
    
    if not updated_content:
        return jsonify({'error': 'Missing updated_content'}), 400
    
    try:
        # Convert indices to integers
        task_index = int(task_index)
        dialogue_index = int(dialogue_index)
        
        # Check if session exists
        subtasks = get_subtasks_from_session(session_id)
        if not subtasks:
            print(f"Session not found: {session_id}")
            # Create empty session instead of failing
            subtasks = []
            save_subtasks_to_session(session_id, subtasks)
            return jsonify({'success': False, 'error': 'Session not found, but created a new one'}), 200
        
        # Ensure task_index is valid
        while len(subtasks) <= task_index:
            print(f"Extending subtasks list to accommodate task_index {task_index}")
            subtasks.append({})
        
        # Ensure the task has an ai_dialogues field
        if 'ai_dialogues' not in subtasks[task_index]:
            print(f"Creating ai_dialogues for task {task_index}")
            subtasks[task_index]['ai_dialogues'] = []
        
        # Ensure the dialogue_index is valid
        ai_dialogues = subtasks[task_index]['ai_dialogues']
        while len(ai_dialogues) <= dialogue_index:
            print(f"Extending ai_dialogues to accommodate dialogue_index {dialogue_index}")
            ai_dialogues.append({
                'role': 'assistant',
                'content': '',
                'step': 'added_dialogue',
                'needs_review': True,
                'original_content': ''
            })
        
        # Update the dialogue
        ai_dialogues[dialogue_index]['content'] = updated_content
        ai_dialogues[dialogue_index]['isEdited'] = True
        
        # Save user edits
        if 'user_edited_dialogues' not in subtasks[task_index]:
            subtasks[task_index]['user_edited_dialogues'] = {}
        
        subtasks[task_index]['user_edited_dialogues'][str(dialogue_index)] = updated_content
        
        # 获取用户名
        username = get_username_from_session(session_id)
        
        # Save the updated subtasks
        save_subtasks_to_session(session_id, subtasks, username)
        
        return jsonify({
            'success': True,
            'message': 'AI dialogue updated successfully'
        })
    
    except Exception as e:
        error_detail = traceback.format_exc()
        print(f"Error in update_ai_dialogue: {str(e)}\n{error_detail}")
        return jsonify({
            'error': str(e),
            'detail': error_detail
        }), 500

@app.route('/save-file', methods=['POST'])
def save_file():
    '''Save code content to specified file'''
    data = request.json
    file_path = data.get('file_path')
    content = data.get('content')
    
    if not file_path:
        return jsonify({'error': 'File path is required'}), 400
    
    if content is None:
        return jsonify({'error': 'Content is required'}), 400
    
    try:

        file_path = file_path.strip('"').strip("'")
        
        file_path = os.path.normpath(file_path)
        
        if os.path.isabs(file_path):
            full_path = file_path
        else:
            full_path = os.path.abspath(file_path)
        
        directory = os.path.dirname(full_path)
        if directory and not os.path.exists(directory):
            try:
                os.makedirs(directory, exist_ok=True)
            except PermissionError:
                return jsonify({
                    'error': 'Permission denied: Cannot create directory',
                    'detail': f'Unable to create directory: {directory}'
                }), 403
        
        try:
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content)
        except PermissionError:
            return jsonify({
                'error': 'Permission denied: Cannot write to file',
                'detail': f'Unable to write to: {full_path}'
            }), 403
        except Exception as e:
            return jsonify({
                'error': f'File write error: {str(e)}',
                'detail': f'Failed to write to: {full_path}'
            }), 500
        
        file_size = os.path.getsize(full_path)
        file_exists = os.path.exists(full_path)
        
        return jsonify({
            'success': True,
            'message': f'File saved successfully',
            'file_path': full_path,
            'original_path': file_path,
            'file_size': file_size,
            'file_exists': file_exists,
            'is_absolute': os.path.isabs(file_path),
            'directory': directory
        })
        
    except Exception as e:
        error_detail = traceback.format_exc()
        print(f"Error saving file: {str(e)}\n{error_detail}")
        return jsonify({
            'error': str(e),
            'detail': error_detail,
            'file_path': file_path
        }), 500

# 添加更新 API Key 的路由
@app.route('/update-api-key', methods=['POST'])
def update_api_key():
    """更新用户的 API Key"""
    data = request.json
    username = data.get('username')
    api_key = data.get('apiKey')
    
    if not username or not api_key:
        return jsonify({'error': 'Username and API key are required'}), 400
    
    # 存储用户的 API Key
    user_api_keys[username] = api_key
    
    print(f"Updated API key for user: {username}")
    
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8001, debug=False)