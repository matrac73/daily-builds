// Transformers from the inside, Mistral architectures, inference & serving.
import { dedent } from '../format.js';

const SRC = {
  karpathyGpt: { label: "Andrej Karpathy — Let's build GPT: from scratch, in code, spelled out", url: 'https://www.youtube.com/watch?v=kCc8FmEb1nY' },
  karpathyDeepDive: { label: 'Andrej Karpathy — Deep Dive into LLMs like ChatGPT', url: 'https://www.youtube.com/watch?v=7xTGNNLPyMI' },
  threeBlue: { label: '3Blue1Brown — chapitres Transformers & attention', url: 'https://www.youtube.com/watch?v=wjZofJX0v4M' },
  alammar: { label: 'Jay Alammar — The Illustrated Transformer', url: 'https://jalammar.github.io/illustrated-transformer/' },
  mistral: { label: 'Mistral 7B (arXiv 2310.06825)', url: 'https://arxiv.org/abs/2310.06825' },
  mixtral: { label: 'Mixtral of Experts (arXiv 2401.04088)', url: 'https://arxiv.org/abs/2401.04088' },
  vllm: { label: 'vLLM / PagedAttention (arXiv 2309.06180)', url: 'https://arxiv.org/abs/2309.06180' },
  hf: { label: 'Hugging Face — LLM Course', url: 'https://huggingface.co/learn/llm-course' },
  cs336: { label: 'Stanford CS336 — Language Modeling from Scratch', url: 'https://cs336.stanford.edu/' },
  interview: { label: 'AI Engineer Interview Questions — Mistral', url: 'https://github.com/ombharatiya/AI-Engineer-Interview-Questions/blob/main/14-company-interview-questions/mistral.md' },
};

const GQA_CODE = dedent`
  class GroupedQueryAttention(nn.Module):
      def __init__(self, n_embd=4096, n_head=32, n_kv_head=8):
          super().__init__()
          self.n_head, self.n_kv_head = n_head, n_kv_head
          self.head_dim = n_embd // n_head
          self.wq = nn.Linear(n_embd, n_head * self.head_dim, bias=False)
          self.wk = nn.Linear(n_embd, n_kv_head * self.head_dim, bias=False)
          self.wv = nn.Linear(n_embd, n_kv_head * self.head_dim, bias=False)
          self.wo = nn.Linear(n_head * self.head_dim, n_embd, bias=False)

      def forward(self, x):
          B, T, C = x.shape
          q = self.wq(x).view(B, T, self.n_head, self.head_dim).transpose(1, 2)
          k = self.wk(x).view(B, T, self.n_kv_head, self.head_dim).transpose(1, 2)
          v = self.wv(x).view(B, T, self.n_kv_head, self.head_dim).transpose(1, 2)
          n_rep = self.n_head // self.n_kv_head
          k = k.repeat_interleave(n_rep, dim=1)
          v = v.repeat_interleave(n_rep, dim=1)
          y = F.scaled_dot_product_attention(q, k, v, is_causal=True)
          return self.wo(y.transpose(1, 2).contiguous().view(B, T, C))
`;

export const transformerQuestions = [
  {
    id: 'tr-scaling',
    topic: 'Attention — facteur d\'échelle',
    prompt: 'Pourquoi divise-t-on les scores QKᵀ par √d_k avant le softmax ?',
    code: dedent`
      wei = q @ k.transpose(-2, -1) * k.shape[-1] ** -0.5
      wei = wei.masked_fill(tril[:T, :T] == 0, float("-inf"))
      wei = F.softmax(wei, dim=-1)
    `,
    choices: [
      "Si q et k ont des composantes de variance 1, q·k a une variance d_k : sans correction le softmax sature et les gradients s'effondrent",
      'Pour que la somme de chaque ligne fasse exactement 1',
      'Pour réduire le coût mémoire de la matrice T×T',
      'Pour rendre la multiplication matricielle commutative',
    ],
    answer: 0,
    explanation:
      "Le produit scalaire de d_k termes indépendants de variance 1 a une variance d_k. Des logits trop grands rendent le softmax quasi one-hot (Karpathy le montre en direct) : l'attention ne se mélange plus et les gradients deviennent minuscules. Diviser par √d_k ramène la variance à 1.",
    source: SRC.karpathyGpt,
  },
  {
    id: 'tr-causal-mask',
    topic: 'Masque causal',
    prompt: 'Dans une attention causale, comment et où applique-t-on le masque ?',
    choices: [
      'On met −∞ aux positions futures (triangle supérieur) AVANT le softmax',
      'On met à 0 les poids du triangle supérieur APRÈS le softmax',
      'On masque les clés dont la norme est trop grande',
      'On applique le masque sur la sortie de la couche feed-forward',
    ],
    answer: 0,
    explanation:
      "Avec −∞ avant le softmax, exp(−∞) = 0 et chaque ligne reste une distribution qui somme à 1 sur le passé uniquement. Mettre à zéro après le softmax laisserait des lignes qui ne somment plus à 1 (et l'information future aurait déjà influencé la normalisation).",
    source: SRC.karpathyGpt,
  },
  {
    id: 'tr-att-shape',
    topic: 'Multi-head attention — dimensions',
    prompt: 'Avec x de forme (B, T, C) et h têtes, quelle est la forme de la matrice des poids d\'attention après le softmax ?',
    choices: ['(B, h, T, T)', '(B, T, C)', '(B, h, T, C/h)', '(B, T, T)'],
    answer: 0,
    explanation:
      "On reshape q, k en (B, h, T, C/h) ; `q @ k.transpose(-2, -1)` donne (B, h, T, T) : un score par paire (requête, clé), pour chaque tête. La sortie `att @ v` revient en (B, h, T, C/h) puis est concaténée en (B, T, C).",
    source: SRC.karpathyGpt,
  },
  {
    id: 'tr-gqa-wk',
    topic: 'Passer en grouped-query attention',
    prompt: 'Dans ce module (n_embd = 4096, 32 têtes de requête, 8 têtes KV), quelle est la taille de sortie de `self.wk` ?',
    code: GQA_CODE,
    choices: ['1024', '4096', '128', '512'],
    answer: 0,
    explanation:
      'head_dim = 4096 / 32 = 128, et `wk` projette vers n_kv_head × head_dim = 8 × 128 = 1024. Les projections K et V sont 4× plus petites qu\'en MHA, ce qui divise d\'autant le cache KV.',
    source: SRC.mistral,
  },
  {
    id: 'tr-gqa-repeat',
    topic: 'Passer en grouped-query attention',
    prompt: 'Que fait exactement `k.repeat_interleave(n_rep, dim=1)` dans ce module ?',
    code: GQA_CODE,
    choices: [
      'Chaque tête KV est dupliquée 4 fois consécutivement : les têtes de requête 0–3 partagent la tête KV 0, etc.',
      'Les 8 têtes KV sont répétées en bloc : la tête de requête 0 et la tête 8 partagent la tête KV 0',
      'Elle duplique la séquence sur l\'axe du temps pour doubler le contexte',
      'Elle moyenne les 32 têtes de requête en 8 groupes',
    ],
    answer: 0,
    explanation:
      "`repeat_interleave` sur dim=1 transforme [k0, k1, …, k7] en [k0, k0, k0, k0, k1, …] : des groupes contigus de 4 têtes de requête partagent une tête KV, ce qui correspond au regroupement de `wq`. (`repeat` donnerait [k0…k7, k0…k7], un autre appariement.) En pratique on évite souvent la copie en reshapant q en (B, n_kv, n_rep, T, d).",
    source: SRC.mistral,
  },
  {
    id: 'tr-mqa-gqa',
    topic: 'MHA, MQA, GQA',
    prompt: 'Quelle affirmation sur MHA, MQA et GQA est correcte ?',
    choices: [
      'GQA généralise les deux : n_kv_head = n_head donne MHA, n_kv_head = 1 donne MQA',
      'MQA utilise une seule tête de requête et plusieurs têtes KV',
      'GQA réduit le nombre de têtes de requête pour accélérer le préremplissage',
      'GQA ne change que l\'inférence : les poids sont identiques à MHA',
    ],
    answer: 0,
    explanation:
      "Multi-Query Attention partage une unique tête K/V entre toutes les requêtes (cache minimal, mais perte de qualité). GQA (Ainslie et al., 2023) interpole avec G groupes. Mistral 7B utilise 32 têtes de requête et 8 têtes KV.",
    source: SRC.mistral,
  },
  {
    id: 'tr-kv-why',
    topic: 'Cache KV',
    prompt: 'Pourquoi met-on en cache K et V mais pas Q pendant la génération ?',
    choices: [
      "Le nouveau token n'a besoin que de SA requête, mais des clés et valeurs de tous les tokens précédents",
      'Q est recalculé à partir de K et V, donc inutile de le stocker',
      'Q est trop volumineux car il a une dimension de plus',
      'On met aussi Q en cache, mais dans une autre mémoire',
    ],
    answer: 0,
    explanation:
      "Au pas t, l'attention calcule softmax(q_t · K_{≤t}ᵀ) V_{≤t}. Les K et V passés ne changent pas (masque causal), on les garde ; les requêtes passées ne resserviront jamais.",
    source: SRC.karpathyDeepDive,
  },
  {
    id: 'tr-kv-memory',
    topic: 'Calcul de la mémoire du cache KV',
    prompt:
      'Mistral 7B : 32 couches, 8 têtes KV, head_dim 128, cache en fp16. Quelle mémoire occupe le cache KV pour UNE séquence de 8 192 tokens (sans sliding window) ?',
    choices: ['1 Gio', '4 Gio', '256 Mio', '16 Gio'],
    answer: 0,
    explanation:
      'Mémoire = 2 (K et V) × n_layers × n_kv_heads × head_dim × T × octets = 2 × 32 × 8 × 128 × 8192 × 2 = 2³⁰ octets = 1 Gio, soit 128 Kio par token. Avec 32 têtes KV (MHA), ce serait 4 Gio : c\'est le gain de GQA.',
    source: SRC.mistral,
  },
  {
    id: 'tr-kv-batch',
    topic: 'Calcul de la mémoire du cache KV',
    prompt:
      'Un modèle à 128 Kio de cache KV par token sert 64 requêtes simultanées de 4 096 tokens. Quelle mémoire faut-il pour le cache KV seul ?',
    choices: ['32 Gio', '8 Gio', '512 Mio', '128 Gio'],
    answer: 0,
    explanation:
      '64 × 4096 = 262 144 tokens × 128 Kio = 32 Gio. Le cache KV grandit linéairement avec batch × longueur : à fort trafic, il dépasse souvent la taille des poids et devient le vrai facteur limitant du dimensionnement GPU.',
    source: SRC.cs336,
  },
  {
    id: 'tr-swa-span',
    topic: 'Sliding window attention',
    prompt:
      'Mistral 7B utilise une fenêtre W = 4 096 sur 32 couches. Quelle est la portée d\'attention théorique d\'un token de la dernière couche ?',
    choices: ['Environ 131 000 tokens (32 × 4096)', '4 096 tokens', '8 192 tokens', 'Infinie, grâce au rolling buffer'],
    answer: 0,
    explanation:
      "Chaque couche permet de remonter de W positions ; en empilant k couches l'information peut voyager jusqu'à k × W tokens en arrière, comme un champ récepteur de CNN. Le papier annonce ≈131K tokens pour W = 4096.",
    source: SRC.mistral,
  },
  {
    id: 'tr-rolling-buffer',
    topic: 'Cache KV en rolling buffer',
    prompt: 'Avec un rolling buffer cache de taille W, où sont stockées les clés/valeurs du token de position i ?',
    choices: [
      'À l\'indice i mod W, en écrasant le token i − W',
      'À l\'indice i, le buffer étant agrandi quand il est plein',
      'Dans un nouveau bloc alloué à la demande',
      'À l\'indice W − i, le buffer étant rempli à l\'envers',
    ],
    answer: 0,
    explanation:
      "Comme l'attention ne regarde jamais plus de W tokens en arrière, le cache a une taille fixe W et sert de buffer circulaire. Pour une séquence de 32K tokens, cela divise la mémoire du cache par 8 sans impact sur la qualité (d'après le papier).",
    source: SRC.mistral,
  },
  {
    id: 'tr-mixtral-params',
    topic: 'Sparse Mixture of Experts',
    prompt: 'Mixtral 8x7B route chaque token vers 2 experts sur 8. Combien de paramètres au total et combien d\'actifs par token ?',
    choices: ['47B au total, 13B actifs', '56B au total, 14B actifs', '47B au total, 7B actifs', '56B au total, 47B actifs'],
    answer: 0,
    explanation:
      "Seuls les blocs feed-forward sont dupliqués en 8 experts ; l'attention, les embeddings et les normes sont partagés. D'où 47B (et non 8 × 7 = 56B) au total, et ~13B utilisés par token avec un top-2. Coût de calcul d'un 13B, mais il faut quand même charger 47B en mémoire.",
    source: SRC.mixtral,
  },
  {
    id: 'tr-mixtral-router',
    topic: 'Sparse Mixture of Experts',
    prompt: 'Comment le routeur de Mixtral combine-t-il les experts pour un token x ?',
    choices: [
      'y = Σ Softmax(TopK(x·W_g))ᵢ · Eᵢ(x) : softmax sur les 2 meilleurs logits seulement',
      'Softmax sur les 8 logits, puis on garde tous les experts pondérés',
      'On choisit l\'expert au hasard parmi les 2 meilleurs',
      'Chaque expert vote et on prend la sortie majoritaire',
    ],
    answer: 0,
    explanation:
      "Le gating calcule des logits linéaires x·W_g, garde les K = 2 plus grands (les autres valent −∞) puis applique un softmax : seuls 2 experts sont exécutés et leurs sorties sont pondérées. Le routage est fait par token et par couche.",
    source: SRC.mixtral,
  },
  {
    id: 'tr-mixtral-specialization',
    topic: 'Sparse Mixture of Experts',
    prompt: "Qu'a montré l'analyse du routage dans le papier Mixtral ?",
    choices: [
      "Pas de spécialisation nette par domaine (maths, biologie…) ; le routage suit plutôt la syntaxe et des tokens consécutifs vont souvent au même expert",
      'Chaque expert est spécialisé dans une langue',
      'Un seul expert reçoit 90 % des tokens',
      'Les experts sont spécialisés par thème : un expert « code », un expert « maths »…',
    ],
    answer: 0,
    explanation:
      "Les auteurs n'observent pas de répartition par sujet sur The Pile ; en revanche certains experts captent des structures syntaxiques (indentation en Python, `self`…) et il y a une forte localité temporelle — utile pour le caching des experts.",
    source: SRC.mixtral,
  },
  {
    id: 'tr-gptq-awq',
    topic: 'Quantization',
    prompt: 'Laquelle de ces associations est correcte ?',
    choices: [
      'GPTQ : compensation de l\'erreur couche par couche via une approximation du second ordre (Hessienne) — AWQ : protège les poids saillants repérés via les activations',
      'GPTQ : format de fichier de llama.cpp — AWQ : quantization pendant l\'entraînement',
      'GPTQ : quantization des activations seulement — AWQ : distillation vers un modèle plus petit',
      'GPTQ et AWQ nécessitent un ré-entraînement complet du modèle',
    ],
    answer: 0,
    explanation:
      "Les deux sont de la post-training quantization des poids (souvent 4 bits) avec un petit jeu de calibration. GPTQ quantifie colonne par colonne et corrige les poids restants grâce à l'inverse de la Hessienne. AWQ observe que ~1 % des canaux (ceux à fortes activations) comptent le plus et les met à l'échelle avant quantization, sans rétropropagation.",
    source: SRC.hf,
  },
  {
    id: 'tr-gguf',
    topic: 'Quantization',
    prompt: "Qu'est-ce que GGUF ?",
    choices: [
      "Le format de fichier de llama.cpp (successeur de GGML) : un seul fichier avec poids quantifiés (ex. Q4_K_M) et métadonnées, pensé pour l'inférence CPU / Apple Silicon",
      'Un algorithme de quantization basé sur la Hessienne',
      'Une méthode de fine-tuning à faible rang',
      'Un format de serving propriétaire de vLLM',
    ],
    answer: 0,
    explanation:
      "GGUF est un format de conteneur, pas un algorithme : il embarque tokenizer, hyperparamètres et tenseurs quantifiés par blocs (k-quants Q2_K…Q8_0). C'est le format utilisé par llama.cpp, Ollama ou LM Studio.",
    source: SRC.hf,
  },
  {
    id: 'tr-quant-memory',
    topic: 'Quantization — mémoire',
    prompt: 'Combien de mémoire faut-il (environ) pour les seuls poids d\'un modèle de 7B paramètres quantifié en 4 bits ?',
    choices: ['≈ 3,5 Go', '≈ 7 Go', '≈ 14 Go', '≈ 28 Go'],
    answer: 0,
    explanation:
      "7 × 10⁹ × 0,5 octet = 3,5 Go (un peu plus en pratique à cause des facteurs d'échelle par groupe). Référence : 28 Go en fp32, 14 Go en fp16/bf16, 7 Go en int8.",
    source: SRC.hf,
  },
  {
    id: 'tr-lora-params',
    topic: 'LoRA',
    prompt: 'On applique LoRA de rang r = 8 sur une matrice de poids 4096 × 4096. Combien de paramètres entraînables ajoute-t-on ?',
    choices: ['65 536', '16 777 216', '32 768', '4 096'],
    answer: 0,
    explanation:
      'ΔW = B·A avec B ∈ ℝ^{4096×8} et A ∈ ℝ^{8×4096} : 2 × 4096 × 8 = 65 536 paramètres, contre 16,7 M pour la matrice complète (≈ 0,4 %). B est initialisée à zéro pour que ΔW = 0 au départ, et la mise à jour est mise à l\'échelle par α/r.',
    source: SRC.hf,
  },
  {
    id: 'tr-qlora',
    topic: 'QLoRA',
    prompt: 'Quelle combinaison décrit QLoRA ?',
    choices: [
      'Modèle de base gelé en 4 bits NF4 + double quantization + optimiseurs paginés, adaptateurs LoRA entraînés en 16 bits',
      'Modèle de base et adaptateurs tous deux entraînés en 4 bits',
      'LoRA appliqué uniquement aux embeddings, en int8',
      'Quantization des gradients en 4 bits pendant un fine-tuning complet',
    ],
    answer: 0,
    explanation:
      "QLoRA (Dettmers et al., 2023) rétropropage à travers un modèle gelé quantifié en NormalFloat4 (adapté aux poids de distribution normale), quantifie aussi les constantes de quantization (double quantization) et utilise la mémoire unifiée pour les pics de l'optimiseur. Cela permet de fine-tuner un 65B sur un seul GPU de 48 Go.",
    source: SRC.hf,
  },
  {
    id: 'tr-paged-attention',
    topic: 'PagedAttention',
    prompt: 'Quel problème PagedAttention (vLLM) résout-il principalement ?',
    choices: [
      'La fragmentation et la sur-réservation de la mémoire du cache KV, en le découpant en blocs non contigus comme des pages de mémoire virtuelle',
      'Le coût quadratique du calcul de l\'attention',
      'La lenteur du tokenizer sur CPU',
      'La synchronisation des gradients entre GPU',
    ],
    answer: 0,
    explanation:
      "Les systèmes précédents réservaient un espace contigu pour la longueur maximale de chaque requête : 60 à 80 % de la mémoire du cache KV était gaspillée. vLLM alloue des blocs de taille fixe (16 tokens par défaut) via une table de blocs par séquence : moins de 4 % de gaspillage et un débit 2 à 4× supérieur.",
    source: SRC.vllm,
  },
  {
    id: 'tr-paged-sharing',
    topic: 'PagedAttention',
    prompt: 'Comment vLLM gère-t-il le parallel sampling (plusieurs complétions pour un même prompt) ?',
    choices: [
      'Les séquences partagent les blocs physiques du prompt (compteur de références) avec copy-on-write au premier bloc qui diverge',
      'Chaque échantillon recalcule et stocke son propre cache KV complet',
      'Les échantillons sont générés séquentiellement pour réutiliser le même cache',
      'Le prompt est recalculé à chaque token pour économiser la mémoire',
    ],
    answer: 0,
    explanation:
      "Comme un fork() d'OS : plusieurs blocs logiques pointent vers le même bloc physique. Quand une séquence doit écrire dans un bloc partagé, il est copié. Même mécanisme pour la beam search et les préfixes de prompt communs.",
    source: SRC.vllm,
  },
  {
    id: 'tr-continuous-batching',
    topic: 'Continuous batching',
    prompt: "Qu'est-ce que le continuous batching (iteration-level scheduling) ?",
    choices: [
      'Le batch est recomposé à chaque pas de décodage : une requête terminée libère sa place immédiatement pour une nouvelle',
      'On attend que le batch soit plein avant de lancer la génération',
      'On découpe chaque requête en plusieurs batches de tokens',
      'On fusionne les prompts de plusieurs utilisateurs dans une même séquence',
    ],
    answer: 0,
    explanation:
      "Avec un batching statique, tout le batch attend la séquence la plus longue. Orca (OSDI 2022) a introduit l'ordonnancement par itération, repris par vLLM, TGI ou TensorRT-LLM : le GPU reste plein et la latence des requêtes courtes chute.",
    source: SRC.vllm,
  },
  {
    id: 'tr-decode-bound',
    topic: 'Inférence — prefill vs decode',
    prompt: 'Pourquoi la phase de décodage (batch 1) est-elle limitée par la bande passante mémoire plutôt que par le calcul ?',
    choices: [
      'Chaque token généré relit tous les poids (et le cache KV) pour très peu de FLOPs : intensité arithmétique ≈ 1 FLOP/octet',
      'Le softmax final sur le vocabulaire est trop coûteux',
      'Le décodage se fait sur CPU',
      "Les GPU n'ont pas d'unités de calcul en fp16",
    ],
    answer: 0,
    explanation:
      "Le prefill traite tous les tokens du prompt en parallèle (grosses multiplications matricielles, compute-bound). Le décodage fait un produit matrice-vecteur par token : ~2 FLOPs par paramètre pour 2 octets lus. D'où l'intérêt du batching, de la quantization et du speculative decoding.",
    source: SRC.cs336,
  },
  {
    id: 'tr-decode-throughput',
    topic: 'Dimensionnement GPU',
    prompt:
      'Borne supérieure du débit en décodage, batch 1 : modèle de 7B en fp16 (14 Go) sur un GPU à ~3,35 To/s de bande passante HBM. Environ combien de tokens/s ?',
    choices: ['≈ 240 tokens/s', '≈ 24 tokens/s', '≈ 2 400 tokens/s', '≈ 24 000 tokens/s'],
    answer: 0,
    explanation:
      "À batch 1, chaque token nécessite de lire tous les poids : 3 350 Go/s ÷ 14 Go ≈ 240 tokens/s, au mieux. Pour dépasser cette borne on batche (les poids lus une fois servent à plusieurs séquences) ou on quantifie.",
    source: SRC.cs336,
  },
  {
    id: 'tr-gpu-sizing',
    topic: 'Dimensionnement GPU',
    prompt: 'Un modèle de 70B en bf16 doit être servi sur des GPU de 80 Go. Quel est le minimum pour tenir les poids ET garder de la place pour le cache KV ?',
    choices: ['4 GPU (tensor parallel)', '1 GPU', '2 GPU, sans marge', '16 GPU'],
    answer: 0,
    explanation:
      "Poids : 70 × 10⁹ × 2 octets = 140 Go. Deux GPU (160 Go) laisseraient ~20 Go pour le cache KV et les activations : trop peu pour un batch utile. On passe typiquement à 4 GPU en tensor parallelism (puissance de 2 qui divise le nombre de têtes), ou on quantifie.",
    source: SRC.cs336,
  },
  {
    id: 'tr-chinchilla',
    topic: 'Scaling laws',
    prompt: 'Selon Chinchilla (Hoffmann et al., 2022), quel ratio tokens/paramètres est compute-optimal ?',
    choices: ['≈ 20 tokens par paramètre', '≈ 1 token par paramètre', '≈ 200 tokens par paramètre', '≈ 2 tokens par paramètre'],
    answer: 0,
    explanation:
      "À budget de calcul fixé, il faut faire croître paramètres et données dans les mêmes proportions : ~20 tokens/paramètre (Chinchilla 70B entraîné sur 1,4T tokens bat Gopher 280B). En pratique on sur-entraîne les petits modèles (Llama, Mistral) car l'inférence coûte plus que l'entraînement.",
    source: SRC.cs336,
  },
  {
    id: 'tr-flops',
    topic: 'Scaling laws',
    prompt: "Ordre de grandeur des FLOPs d'entraînement d'un modèle de 7B paramètres sur 2T tokens ?",
    choices: ['≈ 8,4 × 10²² FLOPs', '≈ 1,4 × 10¹⁶ FLOPs', '≈ 2,8 × 10²⁰ FLOPs', '≈ 8,4 × 10²⁶ FLOPs'],
    answer: 0,
    explanation:
      "Approximation C ≈ 6·N·D (2 FLOPs/paramètre/token en forward, 4 en backward) : 6 × 7·10⁹ × 2·10¹² = 8,4 × 10²². Sur des GPU fournissant ~400 TFLOP/s effectifs, cela fait ~58 000 heures-GPU.",
    source: SRC.cs336,
  },
  {
    id: 'tr-illustrated-dims',
    topic: 'The Illustrated Transformer',
    prompt: "Dans le Transformer original (base) décrit par Jay Alammar, quelles sont les dimensions ?",
    choices: [
      'd_model = 512, 8 têtes de d_k = 64, 6 couches d\'encodeur et 6 de décodeur',
      'd_model = 768, 12 têtes de 64, 12 couches',
      'd_model = 4096, 32 têtes de 128, 32 couches',
      'd_model = 512, 64 têtes de 8, 8 couches',
    ],
    answer: 0,
    explanation:
      "« Attention Is All You Need » (base) : embeddings de 512, 8 têtes de 64 dimensions (512/8), une feed-forward interne de 2048, et des piles de 6 encodeurs et 6 décodeurs. 768/12/12 correspond à BERT-base et GPT-2 small, 4096/32/32 à Mistral 7B.",
    source: SRC.alammar,
  },
  {
    id: 'tr-3b1b-gpt3',
    topic: '3Blue1Brown — GPT-3 en chiffres',
    prompt: 'Dans la série de 3Blue1Brown, quelle est la dimension des embeddings de GPT-3 ?',
    choices: ['12 288', '4 096', '50 257', '2 048'],
    answer: 0,
    explanation:
      "GPT-3 (175B) : embeddings de 12 288 dimensions, 96 couches, 96 têtes de 128 dimensions, vocabulaire de 50 257 tokens et contexte de 2 048. 3Blue1Brown s'en sert pour compter les paramètres matrice par matrice.",
    source: SRC.threeBlue,
  },
  {
    id: 'tr-residual',
    topic: 'Bloc Transformer',
    prompt: 'Dans le GPT de Karpathy, un bloc s\'écrit `x = x + self.sa(self.ln1(x))` puis `x = x + self.ffwd(self.ln2(x))`. Quel est le rôle principal des connexions résiduelles ?',
    choices: [
      'Offrir une « autoroute » au gradient pour entraîner des réseaux profonds',
      'Normaliser les activations',
      'Empêcher les tokens de voir le futur',
      'Réduire le nombre de paramètres',
    ],
    answer: 0,
    explanation:
      "L'addition distribue le gradient tel quel vers les couches basses : au début de l'entraînement les blocs contribuent peu et le réseau se comporte comme un chemin direct. Karpathy utilise la variante pre-norm (LayerNorm avant chaque sous-couche), devenue standard.",
    source: SRC.karpathyGpt,
  },
  {
    id: 'tr-rope',
    topic: 'Encodage positionnel',
    prompt: 'Quel encodage positionnel utilisent Mistral 7B et Mixtral, et quelle est sa propriété clé ?',
    choices: [
      'RoPE : q et k sont tournés d\'un angle dépendant de la position, donc q·k ne dépend que de la position relative',
      'Embeddings de position appris, additionnés aux tokens',
      'Encodage sinusoïdal additif du papier original',
      'Aucun : le masque causal suffit à encoder l\'ordre',
    ],
    answer: 0,
    explanation:
      "Rotary Position Embedding applique des rotations 2D par paires de dimensions sur q et k (pas sur v). Le produit scalaire ⟨R_m q, R_n k⟩ ne dépend que de m − n, ce qui se prête à l'extension de contexte (NTK scaling, YaRN…).",
    source: SRC.mistral,
  },
  {
    id: 'tr-tokenization',
    topic: 'Tokenization',
    prompt: 'Dans « Deep Dive into LLMs », pourquoi Karpathy explique-t-il que les LLM peinent à compter les « r » de « strawberry » ?',
    choices: [
      'Le modèle voit des tokens (morceaux de mots produits par BPE), pas des caractères',
      'Le modèle a été entraîné sans la lettre « r »',
      'La température d\'échantillonnage est trop élevée',
      'Le contexte est trop court pour contenir le mot',
    ],
    answer: 0,
    explanation:
      "Le texte est découpé par Byte Pair Encoding en ~100K tokens possibles (GPT-4) ; « strawberry » n'est que 2 ou 3 tokens, et le modèle n'a pas d'accès direct aux lettres. Karpathy conseille de faire épeler ou d'utiliser un outil (du code) pour ce type de tâche.",
    source: SRC.karpathyDeepDive,
  },
  {
    id: 'tr-mistral-interview',
    topic: 'Question d\'entretien',
    prompt: 'Un entretien Mistral vous demande de diviser la mémoire du cache KV par 4 sans changer la longueur de contexte ni la précision. Quelle option ?',
    choices: [
      'Passer de 32 à 8 têtes KV (GQA) et uptrainer brièvement le modèle',
      'Réduire le vocabulaire de 32K à 8K tokens',
      'Passer de la LayerNorm à la RMSNorm',
      'Remplacer SwiGLU par GELU',
    ],
    answer: 0,
    explanation:
      "Le cache KV est proportionnel à n_layers × n_kv_heads × head_dim × T. Seul n_kv_heads change ici. Ainslie et al. montrent qu'on peut convertir un checkpoint MHA en GQA (moyenne des têtes K/V par groupe) avec ~5 % du compute de pré-entraînement en uptraining.",
    source: SRC.interview,
  },
];
