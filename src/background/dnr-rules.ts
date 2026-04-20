// Builds and tears down per-tab declarativeNetRequest session rules that strip
// X-Frame-Options and CSP frame-ancestors directives so the in-page iframe overlay
// can load sites that would otherwise block framing. Rules are scoped to a single
// tab and removed when emulation stops or the tab closes.

// Reserve a stable rule-id range per tab. Two rules per tab: header strip + CSP edit.
// Chrome session rule IDs must be positive integers and unique within session rules.
const RULE_ID_BASE = 1_000_000;

export function ruleIdsForTab(tabId: number): { xfo: number; csp: number } {
  return {
    xfo: RULE_ID_BASE + tabId * 2,
    csp: RULE_ID_BASE + tabId * 2 + 1,
  };
}

export async function addBypassRulesForTab(tabId: number): Promise<void> {
  const { xfo, csp } = ruleIdsForTab(tabId);

  const rules: chrome.declarativeNetRequest.Rule[] = [
    {
      id: xfo,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        responseHeaders: [
          {
            header: 'X-Frame-Options',
            operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
          },
          {
            header: 'Content-Security-Policy',
            operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
          },
          {
            header: 'Content-Security-Policy-Report-Only',
            operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
          },
        ],
      },
      condition: {
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
          chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
        ],
        tabIds: [tabId],
      },
    },
    {
      id: csp,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        responseHeaders: [
          {
            header: 'Cross-Origin-Embedder-Policy',
            operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
          },
          {
            header: 'Cross-Origin-Opener-Policy',
            operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
          },
        ],
      },
      condition: {
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
          chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
        ],
        tabIds: [tabId],
      },
    },
  ];

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [xfo, csp],
    addRules: rules,
  });
}

export async function removeBypassRulesForTab(tabId: number): Promise<void> {
  const { xfo, csp } = ruleIdsForTab(tabId);
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [xfo, csp],
  });
}
