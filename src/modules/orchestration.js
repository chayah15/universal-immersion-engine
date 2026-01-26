/**
 * Orchestration Engine - Prevents multi-botting in group chats
 * Listens for generation events and injects safety measures
 */

import { getSettings, saveSettings } from "./core.js";
import { notify } from "./notifications.js";

let orchestrationEnabled = true;

/**
 * Check if current chat is a group chat
 */
function isGroupChat() {
    try {
        // Access SillyTavern's context via window object
        if (typeof window.getContext === "function") {
            const context = window.getContext();
            return context && context.groupId !== null;
        }
        // Fallback: check for group-related DOM elements
        return document.querySelector("#group_chat_members") !== null || 
               document.querySelector(".group-chat") !== null;
    } catch (e) {
        console.warn("[UIE Orchestration] Failed to detect group chat:", e);
        return false;
    }
}

/**
 * Get active character name
 */
function getActiveCharacterName() {
    try {
        if (typeof window.getContext === "function") {
            const context = window.getContext();
            return context?.name2 || context?.characters?.[context?.characterId]?.name || "";
        }
        // Fallback: get from DOM
        const charNameEl = document.querySelector(".char_name, .character_name");
        return charNameEl?.textContent?.trim() || "";
    } catch (e) {
        console.warn("[UIE Orchestration] Failed to get active character name:", e);
        return "";
    }
}

/**
 * Get all character names in the group (excluding active character)
 */
function getOtherCharacterNames() {
    try {
        if (typeof window.getContext === "function") {
            const context = window.getContext();
            const activeName = getActiveCharacterName();
            const names = [];
            
            if (context.groupId !== null && context.groups) {
                const group = context.groups.find(g => g.id === context.groupId);
                if (group && group.members) {
                    for (const memberAvatar of group.members) {
                        const char = context.characters?.find(c => c.avatar === memberAvatar);
                        if (char && char.name && char.name !== activeName) {
                            names.push(char.name);
                        }
                    }
                }
            }
            
            // Also check for user name
            if (context?.name1 && context.name1 !== activeName) {
                names.push(context.name1);
            }
            
            return names;
        }
    } catch (e) {
        console.warn("[UIE Orchestration] Failed to get other character names:", e);
    }
    return [];
}

/**
 * Inject system prompt to prevent multi-botting
 */
function injectOrchestrationPrompt() {
    try {
        if (!isGroupChat()) {
            return; // Only apply to group chats
        }
        
        const activeChar = getActiveCharacterName();
        if (!activeChar) {
            return;
        }
        
        const otherNames = getOtherCharacterNames();
        const userName = typeof window.getContext === "function" ? window.getContext()?.name1 : "User";
        
        // Build the orchestration prompt
        let prompt = `You are ${activeChar} ONLY. You must NEVER speak for, narrate for, or respond as any other character.\n\n`;
        prompt += `CRITICAL RULES:\n`;
        prompt += `- Do NOT write dialogue or actions for ${userName} or any other character.\n`;
        prompt += `- Do NOT start your response with another character's name followed by a colon (e.g., "${otherNames[0] || 'OtherCharacter'}:").\n`;
        prompt += `- Do NOT include lines that begin with other character names.\n`;
        prompt += `- Only respond as ${activeChar}.\n`;
        prompt += `- If you are tempted to have another character speak, STOP and only respond as ${activeChar}.\n\n`;
        
        if (otherNames.length > 0) {
            prompt += `Other characters in this scene: ${otherNames.join(", ")}\n`;
            prompt += `You must NOT write dialogue for them. Only ${activeChar} can speak.\n\n`;
        }
        
        prompt += `Remember: You are ${activeChar} and ONLY ${activeChar}.`;
        
        // Inject into extension prompts using SillyTavern's API
        if (typeof window.setExtensionPrompt === "function") {
            // Use extension_prompt_types.IN_CHAT (1) for in-chat injection
            // Use depth 0 to inject at the last message
            // Use extension_prompt_roles.SYSTEM (0) for system role
            const position = window.extension_prompt_types?.IN_CHAT || 1;
            const depth = 0; // Inject at last message
            const role = window.extension_prompt_roles?.SYSTEM || 0;
            const promptKey = "uie_orchestration_anti_multibot";
            
            window.setExtensionPrompt(promptKey, prompt, position, depth, false, role);
            
            console.log("[UIE Orchestration] Injected anti-multibot prompt for", activeChar);
        } else {
            // Fallback: try direct context modification
            if (typeof window.getContext === "function") {
                const context = window.getContext();
                if (context && context.extensionPrompts) {
                    const promptKey = "uie_orchestration_anti_multibot";
                    context.extensionPrompts[promptKey] = {
                        value: prompt,
                        role: 0, // SYSTEM role
                        position: 1, // IN_CHAT position
                        depth: 0,
                        scan: false
                    };
                    console.log("[UIE Orchestration] Injected anti-multibot prompt (fallback) for", activeChar);
                }
            }
        }
    } catch (e) {
        console.error("[UIE Orchestration] Failed to inject prompt:", e);
    }
}

/**
 * Add stop sequences to API params to cut generation if pattern detected
 */
function addStopSequences(apiParams) {
    try {
        if (!isGroupChat()) {
            return apiParams;
        }
        
        const otherNames = getOtherCharacterNames();
        const userName = typeof window.getContext === "function" ? window.getContext()?.name1 : "User";
        
        // Build stop sequences - patterns that indicate another character is speaking
        const stopSequences = [];
        
        // Pattern: \nName: (where Name is another character)
        for (const name of otherNames) {
            stopSequences.push(`\n${name}:`);
            stopSequences.push(`\n${name} :`);
            stopSequences.push(`\n ${name}:`);
        }
        
        // Also stop on user name
        if (userName) {
            stopSequences.push(`\n${userName}:`);
            stopSequences.push(`\n${userName} :`);
        }
        
        // Generic pattern: \n followed by capital letter (likely a name)
        stopSequences.push(`\n[A-Z][a-z]+:`);
        
        // Merge with existing stop sequences
        if (apiParams.stop) {
            if (Array.isArray(apiParams.stop)) {
                apiParams.stop = [...apiParams.stop, ...stopSequences];
            } else {
                apiParams.stop = [apiParams.stop, ...stopSequences];
            }
        } else {
            apiParams.stop = stopSequences;
        }
        
        // Also add to stopping_strings if present
        if (apiParams.stopping_strings) {
            if (Array.isArray(apiParams.stopping_strings)) {
                apiParams.stopping_strings = [...apiParams.stopping_strings, ...stopSequences];
            } else {
                apiParams.stopping_strings = [apiParams.stopping_strings, ...stopSequences];
            }
        }
        
        console.log("[UIE Orchestration] Added stop sequences:", stopSequences);
        return apiParams;
    } catch (e) {
        console.error("[UIE Orchestration] Failed to add stop sequences:", e);
        return apiParams;
    }
}

/**
 * Post-generation regex safety net - strip lines starting with other character names
 */
function sanitizeMultiBotting(messageText) {
    try {
        if (!isGroupChat() || !messageText) {
            return messageText;
        }
        
        const activeChar = getActiveCharacterName();
        const otherNames = getOtherCharacterNames();
        const userName = typeof window.getContext === "function" ? window.getContext()?.name1 : "User";
        
        if (!activeChar) {
            return messageText;
        }
        
        // Build regex pattern to match lines starting with other character names
        const namePatterns = [];
        
        for (const name of otherNames) {
            // Escape special regex characters in name
            const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Match: start of line or newline, followed by name, followed by colon
            namePatterns.push(`(^|\\n)\\s*${escapedName}\\s*:`);
            namePatterns.push(`(^|\\n)\\s*${escapedName}\\s* :`);
        }
        
        if (userName) {
            const escapedUserName = userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            namePatterns.push(`(^|\\n)\\s*${escapedUserName}\\s*:`);
        }
        
        // Also match generic pattern: newline + capital letter word + colon (likely a name)
        // But be careful not to remove the active character's own lines
        const escapedActiveChar = activeChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const genericPattern = `(^|\\n)\\s*([A-Z][a-z]+)\\s*:`;
        
        let sanitized = messageText;
        let hadRemovals = false;
        
        // Remove lines matching other character name patterns
        for (const pattern of namePatterns) {
            const regex = new RegExp(pattern, 'gmi');
            const before = sanitized;
            sanitized = sanitized.replace(regex, (match, p1) => {
                hadRemovals = true;
                return p1 || ''; // Keep the newline if it was at start, otherwise remove
            });
            if (before !== sanitized) {
                console.log(`[UIE Orchestration] Removed line matching pattern: ${pattern}`);
            }
        }
        
        // Remove generic name patterns (but preserve active character)
        const genericRegex = new RegExp(genericPattern, 'gmi');
        sanitized = sanitized.replace(genericRegex, (match, p1, p2) => {
            // If the matched name is the active character, keep it
            if (p2 && p2.toLowerCase() === activeChar.toLowerCase()) {
                return match;
            }
            // Otherwise, remove it
            hadRemovals = true;
            console.log(`[UIE Orchestration] Removed generic name pattern: ${p2}`);
            return p1 || '';
        });
        
        // Clean up multiple consecutive newlines
        sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
        
        if (hadRemovals) {
            console.warn("[UIE Orchestration] Sanitized message to prevent multi-botting");
            try {
                notify("info", "Orchestration Engine removed lines from other characters", "Group Harmony");
            } catch (_) {}
        }
        
        return sanitized.trim();
    } catch (e) {
        console.error("[UIE Orchestration] Failed to sanitize message:", e);
        return messageText;
    }
}

/**
 * Initialize Orchestration Engine
 */
export function initOrchestration() {
    if (!orchestrationEnabled) {
        return;
    }
    
    try {
        // Listen for pre-generation event (CHARACTER_MESSAGE_RENDERED happens before generation)
        if (typeof window.eventSource !== "undefined" && window.eventSource) {
            // Hook into generation before prompts are combined
            window.eventSource.on(window.event_types?.GENERATE_BEFORE_COMBINE_PROMPTS || "generate_before_combine_prompts", () => {
                if (isGroupChat()) {
                    injectOrchestrationPrompt();
                }
            });
            
            // Hook into post-generation to sanitize
            window.eventSource.on(window.event_types?.MESSAGE_RECEIVED || "message_received", (messageId, type) => {
                if (isGroupChat() && type !== 'impersonate') {
                    // Get the message element
                    const messageEl = document.querySelector(`[data-mes-id="${messageId}"]`);
                    if (messageEl) {
                        const textEl = messageEl.querySelector(".mes_text, .mes-text");
                        if (textEl) {
                            const originalText = textEl.textContent || textEl.innerText;
                            const sanitized = sanitizeMultiBotting(originalText);
                            
                            if (sanitized !== originalText) {
                                // Update the message
                                textEl.textContent = sanitized;
                                
        // Also update in chat array if accessible
        if (typeof window.chat !== "undefined" && Array.isArray(window.chat)) {
                                    const message = window.chat.find(m => m.mesId === messageId);
                                    if (message) {
                                        message.mes = sanitized;
                                        message.text = sanitized;
                                    }
                                }
                            }
                        }
                    }
                }
            });
            
            console.log("[UIE Orchestration] Initialized");
        } else {
            console.warn("[UIE Orchestration] eventSource not available");
        }
    } catch (e) {
        console.error("[UIE Orchestration] Initialization failed:", e);
    }
}

/**
 * Enable/disable orchestration
 */
export function setOrchestrationEnabled(enabled) {
    orchestrationEnabled = enabled;
    const s = getSettings();
    if (!s.orchestration) s.orchestration = {};
    s.orchestration.enabled = enabled;
    saveSettings();
}
