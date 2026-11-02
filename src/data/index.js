import { leetcodeProblems } from './leetcode.js';
import { codeReviewQuestions } from './codeReview.js';
import { transformerQuestions } from './transformers.js';
import { agentStackQuestions } from './agentStack.js';

export const CATEGORIES = [
  {
    id: 'leetcode',
    kind: 'leetcode',
    name: 'LeetCode',
    icon: '🧩',
    description: 'Un problème tiré au hasard, 3 questions enchaînées : complexité en temps, en espace, puis culture générale. Chaque réponse dévoile un algo Python.',
    sessionSize: 3,
    items: leetcodeProblems,
  },
  {
    id: 'code-review',
    kind: 'mcq',
    name: 'Relecture de code',
    icon: '🔍',
    description: 'Repérez le bug, la faille ou la lenteur cachés dans un snippet Python, puis comparez avec la version corrigée.',
    sessionSize: 6,
    items: codeReviewQuestions,
  },
  {
    id: 'transformers',
    kind: 'mcq',
    name: 'Transformers & Mistral',
    icon: '⚡',
    description: "Attention causale et GQA en PyTorch, cache KV, sliding window, MoE, quantization, LoRA/QLoRA, PagedAttention, batching et dimensionnement GPU.",
    sessionSize: 8,
    items: transformerQuestions,
  },
  {
    id: 'agent-stack',
    kind: 'mcq',
    name: 'AI agent stack',
    icon: '🤖',
    description: 'LLM et prompt système, RAG structuré/non structuré, MCP vers Outlook, droits OAuth, garde-fous, cache, routeur de modèles et observabilité.',
    sessionSize: 8,
    items: agentStackQuestions,
  },
];

export function findCategory(id) {
  return CATEGORIES.find((category) => category.id === id) ?? null;
}
