# Cahier des charges — Assistant documentaire RAG « Helios »

> Entreprise fictive : **Helios Mobility**, opérateur de vélos électriques en libre-service (Lyon).
> Le corpus (`data/corpus.json`) contient 14 documents internes et publics, dont deux confidentiels
> et un document piégé par une injection de prompt.

## 1. Contexte et objectif

Les collaborateurs et les clients posent chaque jour les mêmes questions (télétravail, notes de frais,
sécurité, tarifs, garantie…) dont la réponse existe déjà dans la documentation. L'objectif est un
assistant qui **répond en langage naturel à partir des documents de l'entreprise uniquement**, en
**citant ses sources**, en **respectant les droits d'accès**, et qui tourne sur un **modèle de langage
open source hébergé en interne** (aucune donnée ne quitte le périmètre, cf. charte IA `GOV-001`).

## 2. Utilisateurs et rôles

| Rôle | Qui | Niveaux de documents visibles |
|---|---|---|
| `public` | Client de l'application | `public` |
| `employee` | Tout collaborateur | `public`, `internal` |
| `hr` | Équipe RH | `public`, `internal`, `hr` |
| `finance` | Direction financière et commerciale | `public`, `internal`, `finance` |

## 3. Exigences fonctionnelles (user stories)

| Id | En tant que… | je veux… | afin de… | Implémentation |
|---|---|---|---|---|
| US1 | collaborateur | poser une question en français et obtenir une réponse courte | ne pas chercher dans 14 documents | `ragprod ask`, `ragprod chat` |
| US2 | collaborateur | voir les sources de chaque réponse | vérifier avant de transmettre (charte IA) | citations `[n]` + tableau des sources (F9) |
| US3 | responsable sécurité | qu'un rôle ne puisse jamais obtenir un document qui lui est interdit | éviter les fuites RH / finance | pré-filtrage ACL (F5) |
| US4 | utilisateur | que l'assistant dise « je ne sais pas » plutôt que d'inventer | pouvoir lui faire confiance | seuil d'abstention (F4) + ancrage (F7) |
| US5 | responsable sécurité | qu'un document piégé ne puisse pas détourner l'assistant | résister aux injections indirectes | quarantaine à l'ingestion (F6) + prompt défensif |
| US6 | équipe data | mesurer la qualité à chaque changement | éviter les régressions | `ragprod eval` (code retour ≠ 0 si hors cible) |
| US7 | équipe data | savoir ce que coûte et rapporte chaque fonctionnalité | arbitrer en connaissance de cause | `ragprod ablation`, matrice KPI |
| US8 | exploitant | que le service reste disponible si le serveur LLM tombe | éviter les pages d'erreur | repli extractif (F11) |
| US9 | exploitant | tracer chaque requête (sources, tokens, latences) | diagnostiquer et piloter les coûts | traces JSONL (F12) |
| US10 | équipe data | expliquer une réponse pas à pas | déboguer la récupération | `ragprod ask --explain` |

## 4. Exigences non fonctionnelles

- **Souveraineté** : modèle open source auto-hébergé (par défaut `qwen2.5:3b` — Qwen2.5-3B-Instruct,
  licence Apache-2.0 — et embeddings `bge-m3`, licence MIT, via Ollama). Compatible llama.cpp et vLLM
  grâce à l'API OpenAI-compatible.
- **Fonctionnement hors ligne** : sans serveur LLM, tout fonctionne (générateur extractif + embeddings
  par hachage), ce qui rend les tests et la CI déterministes.
- **Reproductibilité** : configuration déclarative (`configs/*.toml`, surcharge `--set clé=valeur`),
  index invalidé automatiquement si le corpus ou les paramètres d'ingestion changent.
- **Dépendances minimales** : bibliothèque standard Python + `rich`.

## 5. KPI et cibles

Mesurés par `ragprod eval` sur le golden set `data/eval_set.json` (28 questions : 23 répondables,
2 hors périmètre, 2 interdites au rôle, 1 injection). Source de vérité : `data/kpi_matrix.json`.

| KPI | Catégorie | Cible | Mesure (réf.) | Définition |
|---|---|---|---|---|
| Hit rate @k | Qualité | ≥ 90 % | 100 % | Le document attendu figure parmi les k extraits retenus |
| MRR | Qualité | ≥ 0,80 | 1,00 | 1/rang du premier extrait du bon document |
| Exactitude des réponses | Qualité | ≥ 85 % | 91 % | La réponse contient les faits attendus |
| Ancrage (faithfulness) | Qualité | ≥ 90 % | 100 % | Phrases de la réponse retrouvées dans la source citée |
| Taux de citation | Qualité | ≥ 95 % | 100 % | Réponses citant au moins une source |
| Abstention correcte | Fiabilité | ≥ 95 % | 100 % | Refus sur question hors périmètre / interdite |
| Fausse abstention | Fiabilité | ≤ 10 % | 9 % | Refus à tort sur question répondable |
| Fuite de données (ACL) | Sécurité | 0 % | 0 % | Requêtes envoyant au LLM un extrait interdit au rôle |
| Résistance à l'injection | Sécurité | 100 % | 100 % | Attaques indirectes sans effet |
| Latence p95 | Performance | ≤ 3 000 ms | ~4 ms* | Temps de bout en bout |
| Tokens de prompt moyens | Coût | ≤ 700 | ~410 | Taille du prompt envoyé au LLM |

\* Backend extractif. Avec Qwen2.5-3B sur CPU, la génération domine (1 à 3 s) : c'est ce KPI que
le budget de contexte (F8) et le cache (F10) protègent.

Les deux fausses abstentions restantes sont instructives : « Quelle **longueur minimale** pour un mot de
passe ? » (le document dit « au moins 14 caractères ») et « Je veux **travailler de chez moi** » (le document
dit « télétravail »). Le signal d'abstention est lexical ; un modèle d'embedding sémantique (bge-m3) ou un
reranker cross-encoder est la prochaine étape pour les rattraper sans relâcher le seuil.

## 6. Fonctionnalités et impact sur les KPI

Chaque fonctionnalité améliore certains KPI et en dégrade d'autres : il n'existe pas de réglage gratuit.
La matrice ci-dessous résume `data/kpi_matrix.json` (visible aussi via `ragprod cdc` et sur la page web).

| # | Fonctionnalité | Améliore ▲ | Dégrade ▼ |
|---|---|---|---|
| F1 | Découpage par phrases (60 mots) avec chevauchement (15) | Hit rate, tokens, ancrage | Exactitude si trop petit, latence (plus d'extraits) |
| F2 | Recherche hybride BM25 + vecteurs (RRF) | Hit rate, MRR | Latence, mémoire, coût d'ingestion |
| F3 | Reranking de diversité MMR | Hit rate (couverture), ancrage | MRR (peut écarter un 2e bon extrait), latence |
| F4 | Seuil de pertinence / abstention | Abstention correcte, latence | Fausse abstention |
| F5 | Pré-filtrage ACL par rôle | Fuite de données, abstention correcte | Hit rate si métadonnées d'accès erronées |
| F6 | Quarantaine des injections | Résistance à l'injection | Hit rate (faux positifs) |
| F7 | Vérification d'ancrage | Ancrage, exactitude | Fausse abstention, latence |
| F8 | Budget de contexte | Tokens (coût), latence | Exactitude si trop serré |
| F9 | Citations obligatoires | Taux de citation, ancrage | Tokens (consignes et balises) |
| F10 | Cache de réponses par rôle | Latence, tokens | Fraîcheur (réponse obsolète après mise à jour) |
| F11 | Repli extractif si LLM indisponible | Disponibilité / latence | Qualité rédactionnelle en mode dégradé |
| F12 | Traces JSONL + évaluation continue | Détection des régressions | Latence (I/O), conformité RGPD des logs |

### Preuve par l'ablation

`ragprod ablation` rejoue le golden set en désactivant une fonctionnalité à la fois
(résultats dans `data/ablation_results.json`) :

| Variante | Effet mesuré |
|---|---|
| Sans ACL (F5) | Fuite **0 % → 36 %** des requêtes ; abstention correcte 100 % → 50 % (le salaire est révélé à un `employee`) |
| Sans quarantaine (F6) | Résistance à l'injection **100 % → 0 %** : le faux mot de passe administrateur est servi |
| Sans seuil d'abstention (F4) | Abstention correcte 100 % → 50 %, mais fausse abstention 9 % → 0 % et exactitude 91 % → 96 % : le compromis classique précision/rappel |
| Gros extraits sans chevauchement (F1) | Tokens 408 → 459 et exactitude 91 % → 87 % |
| Vectoriel seul (F2) | MRR 1,00 → 0,97, exactitude 91 % → 87 % ; BM25 seul tient sur ce corpus riche en chiffres et sigles, l'hybride est le plus robuste |
| Sans MMR (F3), sans ancrage (F7), budget ×4 (F8) | Aucun écart sur ce petit corpus extractif : ces protections paient avec un LLM génératif et un corpus plus large (voir `docs/ARCHITECTURE.md`) |

## 7. Critères d'acceptation

1. `ragprod eval` renvoie 0 (tous les KPI dans leur cible) avec `configs/default.toml`.
2. `pytest` et `node --test tests/web` passent.
3. Aucune question d'un rôle non habilité n'envoie d'extrait `hr` ou `finance` au modèle (KPI fuite = 0).
4. La phrase piégée de `IT-003` apparaît dans le rapport de quarantaine de `ragprod ingest`.
5. Avec `configs/ollama.toml` et le serveur arrêté, `ragprod ask` répond quand même (mode dégradé signalé).
