// LeetCode problems. Each problem chains 3 steps: optimal time complexity,
// space complexity of that optimal solution, then a general-culture question.
// A wrong complexity choice points either to a `solution` that really has that
// complexity, or to a `note` explaining why no sensible algorithm does.
import { dedent } from '../format.js';

const TIME_PROMPT = 'Quelle est la complexité en temps optimale pour ce problème ?';
const SPACE_PROMPT = 'Quelle est la complexité en espace (mémoire auxiliaire) de cette solution optimale ?';

export const leetcodeProblems = [
  {
    id: 'two-sum',
    number: 1,
    title: 'Two Sum',
    difficulty: 'Easy',
    statement:
      "Étant donné un tableau d'entiers `nums` et un entier `target`, renvoyer les indices des deux nombres dont la somme vaut `target`. Il existe exactement une solution.",
    signature: 'def two_sum(nums: list[int], target: int) -> list[int]: ...',
    optimal: 'hashmap',
    solutions: {
      hashmap: {
        name: 'Une passe avec table de hachage',
        time: 'O(n)',
        space: 'O(n)',
        explanation: 'Pour chaque élément on cherche son complément `target - x` dans un dictionnaire en O(1) amorti.',
        code: dedent`
          def two_sum(nums, target):
              seen = {}  # valeur -> indice
              for i, x in enumerate(nums):
                  if target - x in seen:
                      return [seen[target - x], i]
                  seen[x] = i
              return []
        `,
      },
      brute: {
        name: 'Force brute sur toutes les paires',
        time: 'O(n²)',
        space: 'O(1)',
        explanation: 'On teste les n(n-1)/2 paires : aucune mémoire supplémentaire, mais quadratique.',
        code: dedent`
          def two_sum(nums, target):
              n = len(nums)
              for i in range(n):
                  for j in range(i + 1, n):
                      if nums[i] + nums[j] == target:
                          return [i, j]
              return []
        `,
      },
      sort: {
        name: 'Tri des indices + deux pointeurs',
        time: 'O(n log n)',
        space: 'O(n)',
        explanation: 'Le tri domine le coût ; il faut trier des indices (et non les valeurs) pour pouvoir les renvoyer.',
        code: dedent`
          def two_sum(nums, target):
              order = sorted(range(len(nums)), key=lambda i: nums[i])
              lo, hi = 0, len(nums) - 1
              while lo < hi:
                  s = nums[order[lo]] + nums[order[hi]]
                  if s == target:
                      return sorted([order[lo], order[hi]])
                  if s < target:
                      lo += 1
                  else:
                      hi -= 1
              return []
        `,
      },
    },
    steps: [
      {
        kind: 'time',
        prompt: TIME_PROMPT,
        explanation: 'Chaque élément doit être lu au moins une fois, donc O(n) est une borne inférieure, atteinte avec un dictionnaire.',
        answer: 0,
        choices: [
          { label: 'O(n)' },
          { label: 'O(n²)', solution: 'brute' },
          { label: 'O(n log n)', solution: 'sort' },
          { label: 'O(log n)', note: "Le tableau n'est pas trié : sans lire chaque élément, on ne peut pas savoir s'il fait partie de la paire." },
        ],
      },
      {
        kind: 'space',
        prompt: SPACE_PROMPT,
        explanation: 'Le dictionnaire peut contenir jusqu\'à n-1 entrées avant de trouver la paire : O(n). C\'est le compromis classique temps/mémoire.',
        answer: 0,
        choices: [
          { label: 'O(n)' },
          { label: 'O(1)', solution: 'brute' },
          { label: 'O(log n)', note: "Aucune structure de taille logarithmique ne permet de retrouver un complément arbitraire en O(1)." },
          { label: 'O(n²)', note: "Stocker toutes les paires (sommes précalculées) coûterait O(n²) sans rien apporter : une seule passe suffit." },
        ],
      },
      {
        kind: 'trivia',
        prompt: 'Quel numéro porte Two Sum sur LeetCode ?',
        explanation: "Two Sum est le problème n°1 de LeetCode, souvent le tout premier exercice d'entretien. Le n°15 est 3Sum et le n°167 « Two Sum II » (entrée triée, résolu en O(1) d'espace avec deux pointeurs).",
        answer: 0,
        choices: ['1', '15', '167', '42'],
      },
    ],
  },
  {
    id: 'valid-parentheses',
    number: 20,
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    statement:
      "Étant donnée une chaîne `s` contenant uniquement les caractères `()[]{}`, déterminer si elle est bien parenthésée : chaque ouvrante est fermée par le bon type, dans le bon ordre.",
    signature: 'def is_valid(s: str) -> bool: ...',
    optimal: 'stack',
    solutions: {
      stack: {
        name: 'Pile',
        time: 'O(n)',
        space: 'O(n)',
        explanation: 'On empile les ouvrantes ; chaque fermante doit correspondre au sommet de la pile.',
        code: dedent`
          def is_valid(s):
              pairs = {")": "(", "]": "[", "}": "{"}
              stack = []
              for c in s:
                  if c in pairs:
                      if not stack or stack.pop() != pairs[c]:
                          return False
                  else:
                      stack.append(c)
              return not stack
        `,
      },
      replace: {
        name: 'Suppressions répétées des paires adjacentes',
        time: 'O(n²)',
        space: 'O(n)',
        explanation: 'Chaque tour recopie la chaîne (O(n)) et peut ne supprimer qu\'une paire : jusqu\'à n/2 tours.',
        code: dedent`
          def is_valid(s):
              prev = None
              while s != prev:
                  prev = s
                  s = s.replace("()", "").replace("[]", "").replace("{}", "")
              return s == ""
        `,
      },
    },
    steps: [
      {
        kind: 'time',
        prompt: TIME_PROMPT,
        explanation: 'Une seule passe avec des opérations de pile en O(1).',
        answer: 0,
        choices: [
          { label: 'O(n)' },
          { label: 'O(n²)', solution: 'replace' },
          { label: 'O(n log n)', note: "Rien à trier ni à diviser : l'ordre des caractères est justement l'information à vérifier." },
          { label: 'O(1)', note: 'Il faut au minimum lire chaque caractère : un seul caractère modifié peut rendre la chaîne invalide.' },
        ],
      },
      {
        kind: 'space',
        prompt: SPACE_PROMPT,
        explanation: 'Dans le pire cas (`((((((`), la pile contient n éléments.',
        answer: 0,
        choices: [
          { label: 'O(n)' },
          { label: 'O(1)', note: "Un simple compteur suffit pour UN seul type de parenthèse, mais pas pour `([)]` : il faut mémoriser l'ordre des ouvrantes." },
          { label: 'O(log n)', note: "Encoder une suite arbitraire de n/2 ouvrantes de 3 types demande Ω(n) bits." },
          { label: 'O(n²)', note: "On ne stocke jamais plus que les ouvrantes en attente : au plus n éléments." },
        ],
      },
      {
        kind: 'trivia',
        prompt: 'En théorie des langages, comment appelle-t-on le langage des mots bien parenthésés ?',
        explanation: "C'est le langage de Dyck. Il n'est pas régulier (lemme de l'étoile) : un automate fini ne suffit pas, il faut un automate à pile — d'où la pile dans la solution.",
        answer: 0,
        choices: ['Le langage de Dyck', 'Le langage de Kleene', 'Un langage régulier', 'Le langage de Backus'],
      },
    ],
  },
  {
    id: 'maximum-subarray',
    number: 53,
    title: 'Maximum Subarray',
    difficulty: 'Medium',
    statement: 'Étant donné un tableau d\'entiers `nums` (non vide), trouver le sous-tableau contigu de somme maximale et renvoyer cette somme.',
    signature: 'def max_sub_array(nums: list[int]) -> int: ...',
    optimal: 'kadane',
    solutions: {
      kadane: {
        name: 'Algorithme de Kadane',
        time: 'O(n)',
        space: 'O(1)',
        explanation: '`cur` est la meilleure somme qui se termine à la position i : soit on prolonge, soit on repart de nums[i].',
        code: dedent`
          def max_sub_array(nums):
              best = cur = nums[0]
              for i in range(1, len(nums)):
                  cur = max(nums[i], cur + nums[i])
                  best = max(best, cur)
              return best
        `,
      },
      brute: {
        name: 'Toutes les paires (i, j) avec somme cumulée',
        time: 'O(n²)',
        space: 'O(1)',
        explanation: 'Pour chaque début i, on étend la fin j en maintenant la somme courante.',
        code: dedent`
          def max_sub_array(nums):
              best = nums[0]
              for i in range(len(nums)):
                  total = 0
                  for j in range(i, len(nums)):
                      total += nums[j]
                      best = max(best, total)
              return best
        `,
      },
      divide: {
        name: 'Diviser pour régner',
        time: 'O(n log n)',
        space: 'O(log n)',
        explanation: 'Le meilleur sous-tableau est à gauche, à droite, ou traverse le milieu (calculé en O(n)). La pile de récursion a une profondeur log n.',
        code: dedent`
          def max_sub_array(nums, lo=0, hi=None):
              if hi is None:
                  hi = len(nums) - 1
              if lo == hi:
                  return nums[lo]
              mid = (lo + hi) // 2
              left_best, total = float("-inf"), 0
              for i in range(mid, lo - 1, -1):
                  total += nums[i]
                  left_best = max(left_best, total)
              right_best, total = float("-inf"), 0
              for i in range(mid + 1, hi + 1):
                  total += nums[i]
                  right_best = max(right_best, total)
              return max(max_sub_array(nums, lo, mid),
                         max_sub_array(nums, mid + 1, hi),
                         left_best + right_best)
        `,
      },
      dp: {
        name: 'Programmation dynamique avec tableau',
        time: 'O(n)',
        space: 'O(n)',
        explanation: 'Même récurrence que Kadane, mais on garde inutilement tout le tableau `dp`.',
        code: dedent`
          def max_sub_array(nums):
              dp = [0] * len(nums)  # dp[i] = meilleure somme finissant en i
              dp[0] = nums[0]
              for i in range(1, len(nums)):
                  dp[i] = max(nums[i], dp[i - 1] + nums[i])
              return max(dp)
        `,
      },
    },
    steps: [
      {
        kind: 'time',
        prompt: TIME_PROMPT,
        explanation: 'Une seule passe suffit grâce à la récurrence de Kadane.',
        answer: 0,
        choices: [
          { label: 'O(n)' },
          { label: 'O(n²)', solution: 'brute' },
          { label: 'O(n log n)', solution: 'divide' },
          { label: 'O(n³)', note: 'Recalculer chaque somme `sum(nums[i:j+1])` from scratch donne O(n³) : la somme cumulée ramène déjà à O(n²).' },
        ],
      },
      {
        kind: 'space',
        prompt: SPACE_PROMPT,
        explanation: 'Kadane ne garde que deux variables : `cur` et `best`.',
        answer: 0,
        choices: [
          { label: 'O(1)' },
          { label: 'O(n)', solution: 'dp' },
          { label: 'O(log n)', solution: 'divide' },
          { label: 'O(n²)', note: 'Une table de toutes les sommes (i, j) serait quadratique et totalement superflue.' },
        ],
      },
      {
        kind: 'trivia',
        prompt: "L'algorithme linéaire classique pour ce problème porte le nom de…",
        explanation: "Joseph « Jay » Kadane, statisticien à Carnegie Mellon. Le problème vient d'Ulf Grenander (analyse d'images) et a été popularisé par Jon Bentley dans sa colonne *Programming Pearls* (1984).",
        answer: 0,
        choices: ['Kadane', 'Kruskal', 'Knuth', 'Karp'],
      },
    ],
  },
  {
    id: 'climbing-stairs',
    number: 70,
    title: 'Climbing Stairs',
    difficulty: 'Easy',
    statement:
      'On monte un escalier de `n` marches en faisant des pas de 1 ou 2 marches. De combien de façons distinctes peut-on arriver en haut ? (On suppose l\'arithmétique en O(1), modèle RAM.)',
    signature: 'def climb_stairs(n: int) -> int: ...',
    optimal: 'matrix',
    solutions: {
      matrix: {
        name: 'Exponentiation rapide de matrice (itérative)',
        time: 'O(log n)',
        space: 'O(1)',
        explanation: '[[1,1],[1,0]]^n = [[F(n+1),F(n)],[F(n),F(n-1)]] ; l\'exponentiation binaire fait log n produits de matrices 2×2.',
        code: dedent`
          def climb_stairs(n):
              def mul(a, b):
                  return [[a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
                          [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]]]
              result, base = [[1, 0], [0, 1]], [[1, 1], [1, 0]]
              while n:
                  if n & 1:
                      result = mul(result, base)
                  base = mul(base, base)
                  n >>= 1
              return result[0][0]  # F(n + 1)
        `,
      },
      linear: {
        name: 'DP itérative à deux variables',
        time: 'O(n)',
        space: 'O(1)',
        explanation: 'ways(n) = ways(n-1) + ways(n-2) : on ne garde que les deux dernières valeurs. La réponse que tout le monde donne… mais pas la plus rapide.',
        code: dedent`
          def climb_stairs(n):
              a, b = 1, 1
              for _ in range(n):
                  a, b = b, a + b
              return a
        `,
      },
      naive: {
        name: 'Récursion naïve',
        time: 'O(2ⁿ)',
        space: 'O(n)',
        explanation: "L'arbre d'appels recalcule les mêmes sous-problèmes une infinité de fois (en φⁿ ≈ 1,618ⁿ).",
        code: dedent`
          def climb_stairs(n):
              if n <= 1:
                  return 1
              return climb_stairs(n - 1) + climb_stairs(n - 2)
        `,
      },
      memo: {
        name: 'Récursion mémoïsée',
        time: 'O(n)',
        space: 'O(n)',
        explanation: 'Le cache stocke n valeurs et la pile de récursion monte à n.',
        code: dedent`
          from functools import lru_cache

          @lru_cache(maxsize=None)
          def climb_stairs(n):
              if n <= 1:
                  return 1
              return climb_stairs(n - 1) + climb_stairs(n - 2)
        `,
      },
      doubling: {
        name: 'Fast doubling récursif',
        time: 'O(log n)',
        space: 'O(log n)',
        explanation: 'F(2k) = F(k)(2F(k+1) − F(k)) et F(2k+1) = F(k)² + F(k+1)² ; la récursion a une profondeur log n.',
        code: dedent`
          def climb_stairs(n):
              def fib_pair(k):  # renvoie (F(k), F(k+1))
                  if k == 0:
                      return 0, 1
                  a, b = fib_pair(k // 2)
                  c = a * (2 * b - a)
                  d = a * a + b * b
                  return (d, c + d) if k % 2 else (c, d)
              return fib_pair(n + 1)[0]
        `,
      },
    },
    steps: [
      {
        kind: 'time',
        prompt: TIME_PROMPT,
        explanation: "C'est Fibonacci décalé : l'exponentiation rapide de la matrice de Fibonacci donne O(log n) multiplications.",
        answer: 0,
        choices: [
          { label: 'O(log n)' },
          { label: 'O(n)', solution: 'linear' },
          { label: 'O(2ⁿ)', solution: 'naive' },
          { label: 'O(1)', note: 'La formule de Binet (φⁿ/√5) semble O(1), mais en flottants elle devient fausse vers n ≈ 70 et la puissance elle-même n\'est pas gratuite.' },
        ],
      },
      {
        kind: 'space',
        prompt: SPACE_PROMPT,
        explanation: 'La version itérative ne manipule que deux matrices 2×2.',
        answer: 0,
        choices: [
          { label: 'O(1)' },
          { label: 'O(n)', solution: 'memo' },
          { label: 'O(log n)', solution: 'doubling' },
          { label: 'O(2ⁿ)', note: 'Même la récursion naïve n\'occupe que O(n) de pile : les appels exponentiels ne sont pas simultanés.' },
        ],
      },
      {
        kind: 'trivia',
        prompt: 'La suite des réponses 1, 2, 3, 5, 8, 13… est une suite célèbre. Laquelle ?',
        explanation: "Fibonacci (décalée d'un rang : ways(n) = F(n+1)). Elle était connue des métriciens indiens (Pingala, Virahanka) pour compter les rythmes en syllabes courtes/longues — exactement des pas de 1 ou 2 — bien avant le *Liber Abaci* (1202).",
        answer: 0,
        choices: ['Fibonacci', 'Catalan', 'Lucas', 'Les nombres triangulaires'],
      },
    ],
  },
  {
    id: 'binary-search',
    number: 704,
    title: 'Binary Search',
    difficulty: 'Easy',
    statement: 'Étant donné un tableau `nums` trié par ordre croissant et une valeur `target`, renvoyer l\'indice de `target` ou -1 s\'il est absent.',
    signature: 'def search(nums: list[int], target: int) -> int: ...',
    optimal: 'iterative',
    solutions: {
      iterative: {
        name: 'Recherche dichotomique itérative',
        time: 'O(log n)',
        space: 'O(1)',
        explanation: 'On divise l\'intervalle par deux à chaque itération ; `lo + (hi - lo) // 2` évite le débordement dans les langages à entiers bornés.',
        code: dedent`
          def search(nums, target):
              lo, hi = 0, len(nums) - 1
              while lo <= hi:
                  mid = lo + (hi - lo) // 2
                  if nums[mid] == target:
                      return mid
                  if nums[mid] < target:
                      lo = mid + 1
                  else:
                      hi = mid - 1
              return -1
        `,
      },
      linear: {
        name: 'Parcours linéaire',
        time: 'O(n)',
        space: 'O(1)',
        explanation: "Correct, mais ignore complètement le fait que le tableau est trié.",
        code: dedent`
          def search(nums, target):
              for i, x in enumerate(nums):
                  if x == target:
                      return i
              return -1
        `,
      },
      recursive: {
        name: 'Dichotomie récursive',
        time: 'O(log n)',
        space: 'O(log n)',
        explanation: 'Même nombre de comparaisons, mais chaque niveau de récursion occupe un cadre de pile (Python n\'optimise pas les appels terminaux).',
        code: dedent`
          def search(nums, target, lo=0, hi=None):
              if hi is None:
                  hi = len(nums) - 1
              if lo > hi:
                  return -1
              mid = (lo + hi) // 2
              if nums[mid] == target:
                  return mid
              if nums[mid] < target:
                  return search(nums, target, mid + 1, hi)
              return search(nums, target, lo, mid - 1)
        `,
      },
      slicing: {
        name: 'Dichotomie par slicing',
        time: 'O(n)',
        space: 'O(n)',
        explanation: 'Piège classique : `nums[mid + 1:]` copie la moitié du tableau à chaque appel, soit n/2 + n/4 + … = O(n) en temps ET en mémoire.',
        code: dedent`
          def search(nums, target):
              if not nums:
                  return -1
              mid = len(nums) // 2
              if nums[mid] == target:
                  return mid
              if nums[mid] < target:
                  found = search(nums[mid + 1:], target)  # copie !
                  return -1 if found == -1 else mid + 1 + found
              return search(nums[:mid], target)
        `,
      },
    },
    steps: [
      {
        kind: 'time',
        prompt: TIME_PROMPT,
        explanation: 'Chaque comparaison élimine la moitié des candidats : ⌈log₂(n+1)⌉ comparaisons au pire, ce qui est optimal dans le modèle par comparaisons.',
        answer: 0,
        choices: [
          { label: 'O(log n)' },
          { label: 'O(n)', solution: 'linear' },
          { label: 'O(1)', note: 'Sans hypothèse sur la distribution des valeurs, une comparaison ne peut éliminer que la moitié des positions.' },
          { label: 'O(n log n)', note: 'Trier coûterait O(n log n), mais le tableau est déjà trié : aucune raison de le faire.' },
        ],
      },
      {
        kind: 'space',
        prompt: SPACE_PROMPT,
        explanation: 'Trois entiers (`lo`, `hi`, `mid`) suffisent.',
        answer: 0,
        choices: [
          { label: 'O(1)' },
          { label: 'O(log n)', solution: 'recursive' },
          { label: 'O(n)', solution: 'slicing' },
          { label: 'O(n log n)', note: 'Aucune variante raisonnable ne consomme autant : même les copies par slicing restent en O(n) au total.' },
        ],
      },
      {
        kind: 'trivia',
        prompt: 'En 2006, Joshua Bloch (Google) a révélé un bug présent depuis ~10 ans dans la recherche dichotomique du JDK. Lequel ?',
        explanation: "`int mid = (low + high) / 2` déborde quand low + high dépasse 2³¹ − 1 (tableaux de plus d'un milliard d'éléments). Correctif : `low + (high - low) / 2` ou `(low + high) >>> 1`. Les entiers Python sont non bornés, mais l'habitude reste bonne à prendre.",
        answer: 0,
        choices: [
          'Le débordement d\'entier dans `(low + high) / 2`',
          'Une boucle infinie quand la cible est absente',
          'Un mauvais résultat sur les tableaux de taille paire',
          'Un accès hors bornes sur un tableau vide',
        ],
      },
    ],
  },
  {
    id: 'best-time-stock',
    number: 121,
    title: 'Best Time to Buy and Sell Stock',
    difficulty: 'Easy',
    statement:
      "`prices[i]` est le prix d'une action le jour i. On achète un jour et on revend un jour ultérieur. Renvoyer le profit maximal (0 si aucun profit n'est possible).",
    signature: 'def max_profit(prices: list[int]) -> int: ...',
    optimal: 'onepass',
    solutions: {
      onepass: {
        name: 'Une passe avec minimum courant',
        time: 'O(n)',
        space: 'O(1)',
        explanation: 'Le meilleur achat pour une vente au jour i est le minimum des prix précédents : on le maintient au fil de l\'eau.',
        code: dedent`
          def max_profit(prices):
              best, lowest = 0, float("inf")
              for p in prices:
                  lowest = min(lowest, p)
                  best = max(best, p - lowest)
              return best
        `,
      },
      brute: {
        name: 'Toutes les paires achat/vente',
        time: 'O(n²)',
        space: 'O(1)',
        explanation: 'On essaie chaque couple (i < j).',
        code: dedent`
          def max_profit(prices):
              best = 0
              for i in range(len(prices)):
                  for j in range(i + 1, len(prices)):
                      best = max(best, prices[j] - prices[i])
              return best
        `,
      },
      prefix: {
        name: 'Tableau des minimums préfixes',
        time: 'O(n)',
        space: 'O(n)',
        explanation: 'Correct et linéaire, mais le tableau `min_before` est inutile : seule la dernière valeur sert.',
        code: dedent`
          def max_profit(prices):
              min_before, lowest = [], float("inf")
              for p in prices:
                  lowest = min(lowest, p)
                  min_before.append(lowest)
              return max((p - m for p, m in zip(prices, min_before)), default=0)
        `,
      },
    },
    steps: [
      {
        kind: 'time',
        prompt: TIME_PROMPT,
        explanation: 'Une seule passe : chaque prix est soit un nouveau minimum, soit un candidat de vente.',
        answer: 0,
        choices: [
          { label: 'O(n)' },
          { label: 'O(n²)', solution: 'brute' },
          { label: 'O(n log n)', note: "Trier détruirait l'ordre chronologique, qui est la contrainte du problème ; un diviser-pour-régner serait possible mais inutilement lent." },
          { label: 'O(log n)', note: 'Le meilleur jour de vente peut être n\'importe où : il faut regarder chaque prix.' },
        ],
      },
      {
        kind: 'space',
        prompt: SPACE_PROMPT,
        explanation: 'Deux variables : le minimum vu jusqu\'ici et le meilleur profit.',
        answer: 0,
        choices: [
          { label: 'O(1)' },
          { label: 'O(n)', solution: 'prefix' },
          { label: 'O(log n)', note: 'Aucune récursion ni structure logarithmique n\'est nécessaire.' },
          { label: 'O(n²)', note: 'Une matrice de tous les profits (i, j) serait quadratique sans aucun bénéfice.' },
        ],
      },
      {
        kind: 'trivia',
        prompt: 'Ce problème est en réalité un cas particulier de quel autre classique ?',
        explanation: 'Le profit d\'un achat en i et d\'une vente en j est la somme des variations journalières `prices[k+1] - prices[k]` entre i et j : on cherche donc le sous-tableau de somme maximale (Kadane) sur les différences.',
        answer: 0,
        choices: ['Maximum Subarray (Kadane)', 'Longest Increasing Subsequence', 'Knapsack 0/1', 'Trapping Rain Water'],
      },
    ],
  },
  {
    id: 'linked-list-cycle',
    number: 141,
    title: 'Linked List Cycle',
    difficulty: 'Easy',
    statement: 'Étant donnée la tête `head` d\'une liste chaînée, déterminer si elle contient un cycle (un nœud atteignable à nouveau en suivant `next`).',
    signature: 'def has_cycle(head: ListNode | None) -> bool: ...',
    optimal: 'floyd',
    solutions: {
      floyd: {
        name: 'Lièvre et tortue (Floyd)',
        time: 'O(n)',
        space: 'O(1)',
        explanation: 'Le lièvre avance de 2, la tortue de 1 : s\'il y a un cycle, l\'écart diminue de 1 à chaque tour dans le cycle et ils se rencontrent.',
        code: dedent`
          def has_cycle(head):
              slow = fast = head
              while fast and fast.next:
                  slow = slow.next
                  fast = fast.next.next
                  if slow is fast:
                      return True
              return False
        `,
      },
      hashset: {
        name: 'Ensemble des nœuds visités',
        time: 'O(n)',
        space: 'O(n)',
        explanation: 'On mémorise chaque nœud (par identité) : le premier revisité prouve un cycle.',
        code: dedent`
          def has_cycle(head):
              seen = set()
              node = head
              while node:
                  if node in seen:
                      return True
                  seen.add(node)
                  node = node.next
              return False
        `,
      },
      quadratic: {
        name: 'Re-parcours depuis la tête',
        time: 'O(n²)',
        space: 'O(1)',
        explanation: 'Pour le k-ième nœud visité, on vérifie s\'il apparaît parmi les k premiers : pas de mémoire, mais quadratique.',
        code: dedent`
          def has_cycle(head):
              node, steps = head, 0
              while node:
                  probe = head
                  for _ in range(steps):
                      if probe is node:
                          return True
                      probe = probe.next
                  node, steps = node.next, steps + 1
              return False
        `,
      },
    },
    steps: [
      {
        kind: 'time',
        prompt: TIME_PROMPT,
        explanation: 'Il faut potentiellement parcourir toute la liste ; Floyd le fait en O(n) pas.',
        answer: 0,
        choices: [
          { label: 'O(n)' },
          { label: 'O(n²)', solution: 'quadratic' },
          { label: 'O(n log n)', note: 'On ne peut ni trier ni indexer une liste chaînée de manière utile ici.' },
          { label: 'O(log n)', note: "Une liste chaînée n'offre qu'un accès séquentiel : impossible de sauter au milieu." },
        ],
      },
      {
        kind: 'space',
        prompt: SPACE_PROMPT,
        explanation: 'Deux pointeurs, quelle que soit la taille de la liste : c\'est tout l\'intérêt de Floyd par rapport au `set`.',
        answer: 0,
        choices: [
          { label: 'O(1)' },
          { label: 'O(n)', solution: 'hashset' },
          { label: 'O(log n)', note: 'Aucune structure logarithmique ne permet de reconnaître un nœud déjà vu.' },
          { label: 'O(n²)', note: 'On ne stocke jamais plus que les n nœuds eux-mêmes.' },
        ],
      },
      {
        kind: 'trivia',
        prompt: "À qui attribue-t-on l'algorithme « du lièvre et de la tortue » ?",
        explanation: "Robert W. Floyd (d'après Knuth). Richard Brent en a proposé en 1980 une variante plus rapide en pratique, à base de puissances de deux. Le même principe sert dans l'algorithme rho de Pollard pour la factorisation.",
        answer: 0,
        choices: ['Robert Floyd', 'Edsger Dijkstra', 'Richard Bellman', 'Tony Hoare'],
      },
    ],
  },
  {
    id: 'longest-substring',
    number: 3,
    title: 'Longest Substring Without Repeating Characters',
    difficulty: 'Medium',
    statement: 'Étant donnée une chaîne `s`, trouver la longueur de la plus longue sous-chaîne (contiguë) sans caractère répété. On note k la taille de l\'alphabet.',
    signature: 'def length_of_longest_substring(s: str) -> int: ...',
    optimal: 'window',
    solutions: {
      window: {
        name: 'Fenêtre glissante + dernier indice vu',
        time: 'O(n)',
        space: 'O(min(n, k))',
        explanation: 'Quand un caractère réapparaît dans la fenêtre, on saute directement le début après son ancienne position.',
        code: dedent`
          def length_of_longest_substring(s):
              last = {}  # caractère -> dernier indice vu
              best = start = 0
              for i, c in enumerate(s):
                  if last.get(c, -1) >= start:
                      start = last[c] + 1
                  last[c] = i
                  best = max(best, i - start + 1)
              return best
        `,
      },
      brute: {
        name: 'Extension depuis chaque début',
        time: 'O(n²)',
        space: 'O(min(n, k))',
        explanation: 'Pour chaque début, on étend tant que le caractère n\'est pas dans l\'ensemble.',
        code: dedent`
          def length_of_longest_substring(s):
              best = 0
              for i in range(len(s)):
                  seen = set()
                  for j in range(i, len(s)):
                      if s[j] in seen:
                          break
                      seen.add(s[j])
                  best = max(best, len(seen))
              return best
        `,
      },
      cubic: {
        name: 'Test de toutes les sous-chaînes',
        time: 'O(n³)',
        space: 'O(n)',
        explanation: 'O(n²) sous-chaînes, chacune vérifiée en O(n) avec un `set`.',
        code: dedent`
          def length_of_longest_substring(s):
              best = 0
              for i in range(len(s)):
                  for j in range(i + 1, len(s) + 1):
                      if len(set(s[i:j])) == j - i:
                          best = max(best, j - i)
              return best
        `,
      },
    },
    steps: [
      {
        kind: 'time',
        prompt: TIME_PROMPT,
        explanation: 'Chaque caractère entre et sort de la fenêtre au plus une fois.',
        answer: 0,
        choices: [
          { label: 'O(n)' },
          { label: 'O(n²)', solution: 'brute' },
          { label: 'O(n³)', solution: 'cubic' },
          { label: 'O(log n)', note: 'Il faut lire chaque caractère pour savoir s\'il est répété.' },
        ],
      },
      {
        kind: 'space',
        prompt: SPACE_PROMPT,
        explanation: 'Le dictionnaire contient au plus un indice par caractère distinct : min(n, k).',
        answer: 0,
        choices: [
          { label: 'O(min(n, k))' },
          { label: 'O(n²)', note: 'Stocker toutes les sous-chaînes serait quadratique (voire pire) et inutile.' },
          { label: 'O(n · k)', note: "Un compteur par position et par caractère n'apporte rien : un seul indice par caractère suffit." },
          { label: 'O(log n)', note: 'Il faut se souvenir de la dernière position de chaque caractère distinct rencontré.' },
        ],
      },
      {
        kind: 'trivia',
        prompt: 'Quelle technique générique ce problème illustre-t-il ?',
        explanation: "La fenêtre glissante (sliding window / two pointers) : deux indices qui ne reculent jamais, d'où une complexité linéaire amortie. On la retrouve dans Minimum Window Substring (#76) ou Sliding Window Maximum (#239).",
        answer: 0,
        choices: ['La fenêtre glissante', 'Le backtracking', 'Diviser pour régner', 'Le tri topologique'],
      },
    ],
  },
];
