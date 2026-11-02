// Code review: spot the main defect in a short Python snippet.
import { dedent } from '../format.js';

const PROMPT = 'En relecture de code, quel est le problème principal de ce snippet ?';

export const codeReviewQuestions = [
  {
    id: 'cr-mutable-default',
    topic: 'Argument par défaut mutable',
    prompt: PROMPT,
    code: dedent`
      def add_tag(tag, tags=[]):
          tags.append(tag)
          return tags

      a = add_tag("python")
      b = add_tag("rust")   # b == ["python", "rust"] ?!
    `,
    choices: [
      'La liste par défaut est créée une seule fois et partagée entre tous les appels',
      '`append` renvoie `None`, donc la fonction renvoie toujours `None`',
      'Les chaînes sont immuables, `append` lève une exception',
      'Il faut annoter `tags: list[str]` pour que Python crée une nouvelle liste',
    ],
    answer: 0,
    explanation:
      "Les valeurs par défaut sont évaluées **une seule fois**, à la définition de la fonction. Tous les appels sans `tags` partagent la même liste, qui grossit d'appel en appel. Idiome : `None` comme sentinelle.",
    fixedCode: dedent`
      def add_tag(tag, tags=None):
          tags = [] if tags is None else tags
          tags.append(tag)
          return tags
    `,
  },
  {
    id: 'cr-sql-injection',
    topic: 'Injection SQL',
    prompt: PROMPT,
    code: dedent`
      def find_user(conn, email):
          query = f"SELECT id, name FROM users WHERE email = '{email}'"
          return conn.execute(query).fetchone()
    `,
    choices: [
      "L'entrée utilisateur est interpolée dans la requête : injection SQL",
      '`fetchone` peut renvoyer plusieurs lignes',
      "Les f-strings sont plus lentes que `%` pour construire du SQL",
      "Il manque un `conn.commit()` après le SELECT",
    ],
    answer: 0,
    explanation:
      "Avec `email = \"' OR '1'='1\"`, la requête renvoie le premier utilisateur venu. Il faut des **requêtes paramétrées** : le driver envoie la valeur séparément du SQL, sans jamais l'interpréter.",
    fixedCode: dedent`
      def find_user(conn, email):
          query = "SELECT id, name FROM users WHERE email = ?"
          return conn.execute(query, (email,)).fetchone()
    `,
  },
  {
    id: 'cr-late-binding',
    topic: 'Closures et liaison tardive',
    prompt: 'Que vaut `[h(10) for h in handlers]` et pourquoi est-ce un bug ?',
    code: dedent`
      handlers = []
      for factor in [1, 2, 3]:
          handlers.append(lambda x: x * factor)
    `,
    choices: [
      '`[30, 30, 30]` : chaque lambda lit `factor` au moment de l\'appel, pas de la création',
      '`[10, 20, 30]` : le code est correct',
      '`NameError` car `factor` n\'existe plus après la boucle',
      '`[10, 10, 10]` : seule la première valeur est capturée',
    ],
    answer: 0,
    explanation:
      "Les closures Python capturent la **variable**, pas sa valeur. Après la boucle `factor == 3` pour tout le monde. On fige la valeur avec un argument par défaut ou `functools.partial`.",
    fixedCode: dedent`
      handlers = [lambda x, f=factor: x * f for factor in [1, 2, 3]]
    `,
  },
  {
    id: 'cr-mutate-while-iterating',
    topic: 'Modifier une liste pendant son parcours',
    prompt: PROMPT,
    code: dedent`
      def drop_negatives(values):
          for v in values:
              if v < 0:
                  values.remove(v)
          return values

      drop_negatives([-1, -2, 3])  # [-2, 3] !
    `,
    choices: [
      "Supprimer pendant l'itération décale les indices : certains éléments sont sautés",
      '`remove` supprime toutes les occurrences au lieu d\'une seule',
      'La comparaison `v < 0` échoue sur les flottants',
      'La fonction devrait lever une exception sur une liste vide',
    ],
    answer: 0,
    explanation:
      "L'itérateur avance d'un indice pendant que `remove` décale la liste vers la gauche : l'élément suivant est sauté. En plus, `remove` est O(n), donc l'ensemble est O(n²). On construit une nouvelle liste.",
    fixedCode: dedent`
      def drop_negatives(values):
          return [v for v in values if v >= 0]
    `,
  },
  {
    id: 'cr-quadratic-membership',
    topic: 'Complexité cachée',
    prompt: 'Ce code est correct mais lent sur 100 000 éléments. Pourquoi ?',
    code: dedent`
      def common_ids(orders, blocked_ids):
          # blocked_ids: list[int] de 100 000 éléments
          return [o for o in orders if o.customer_id not in blocked_ids]
    `,
    choices: [
      '`not in` sur une liste est O(n) : le tout est O(n·m)',
      'Les compréhensions de liste sont plus lentes qu\'une boucle `for`',
      'Il faudrait trier `orders` avant le filtre',
      '`customer_id` est un attribut, son accès est coûteux',
    ],
    answer: 0,
    explanation:
      "Le test d'appartenance sur une `list` parcourt toute la liste. Convertir une fois en `set` rend chaque test O(1) en moyenne : O(n + m) au total.",
    fixedCode: dedent`
      def common_ids(orders, blocked_ids):
          blocked = set(blocked_ids)
          return [o for o in orders if o.customer_id not in blocked]
    `,
  },
  {
    id: 'cr-float-money',
    topic: 'Flottants et argent',
    prompt: PROMPT,
    code: dedent`
      def total_ttc(prices_ht, vat=0.2):
          total = 0.0
          for p in prices_ht:
              total += p * (1 + vat)
          return total

      assert total_ttc([0.1, 0.2]) == 0.36
    `,
    choices: [
      "Les flottants binaires ne représentent pas 0,1 exactement : erreurs d'arrondi sur des montants",
      "La TVA devrait être un entier",
      '`total` doit être initialisé à `0` et non `0.0`',
      "La boucle devrait utiliser `sum()` pour être correcte",
    ],
    answer: 0,
    explanation:
      "`0.1 + 0.2 != 0.3` en IEEE 754. Pour de l'argent : `decimal.Decimal` (construit depuis des chaînes) ou des entiers en centimes, avec une règle d'arrondi explicite. Et jamais d'égalité stricte entre flottants.",
    fixedCode: dedent`
      from decimal import Decimal, ROUND_HALF_UP

      def total_ttc(prices_ht, vat=Decimal("0.2")):
          total = sum((Decimal(p) * (1 + vat) for p in prices_ht), Decimal("0"))
          return total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

      assert total_ttc(["0.1", "0.2"]) == Decimal("0.36")
    `,
  },
  {
    id: 'cr-hardcoded-secret',
    topic: 'Secrets dans le code',
    prompt: PROMPT,
    code: dedent`
      import logging
      import requests

      API_KEY = "sk-live-9f2c1e..."

      def ask_llm(prompt):
          logging.info("Calling LLM with key=%s prompt=%s", API_KEY, prompt)
          return requests.post(URL, headers={"Authorization": f"Bearer {API_KEY}"},
                               json={"prompt": prompt}, timeout=30)
    `,
    choices: [
      'La clé est en dur dans le code ET écrite dans les logs',
      'Il manque `verify=False` pour accepter tous les certificats',
      'Le timeout de 30 s est trop court pour un LLM',
      '`logging.info` devrait être `print` en production',
    ],
    answer: 0,
    explanation:
      "Une clé commitée finit dans l'historique git (il faut la révoquer, pas seulement la supprimer). Elle doit venir de l'environnement ou d'un gestionnaire de secrets, et ne jamais être loggée — pas plus que les prompts bruts s'ils contiennent des données personnelles.",
    fixedCode: dedent`
      import logging
      import os
      import requests

      API_KEY = os.environ["LLM_API_KEY"]

      def ask_llm(prompt):
          logging.info("Calling LLM (prompt_chars=%d)", len(prompt))
          return requests.post(URL, headers={"Authorization": f"Bearer {API_KEY}"},
                               json={"prompt": prompt}, timeout=30)
    `,
  },
  {
    id: 'cr-race-condition',
    topic: 'Concurrence',
    prompt: PROMPT,
    code: dedent`
      import threading

      counter = 0

      def worker():
          global counter
          for _ in range(100_000):
              counter += 1

      threads = [threading.Thread(target=worker) for _ in range(8)]
      for t in threads: t.start()
      for t in threads: t.join()
      print(counter)  # pas toujours 800000
    `,
    choices: [
      '`counter += 1` n\'est pas atomique : lecture, addition, écriture peuvent s\'entrelacer',
      'Le GIL garantit que le résultat est toujours 800 000',
      '`join` doit être appelé avant `start`',
      'Il faut déclarer `counter` comme `nonlocal`',
    ],
    answer: 0,
    explanation:
      "Le GIL sérialise les bytecodes, pas les opérations Python de haut niveau : `+=` fait LOAD, ADD, STORE et un changement de thread peut survenir entre les deux. Il faut un `Lock` (ou que chaque thread accumule localement puis agrège).",
    fixedCode: dedent`
      lock = threading.Lock()

      def worker():
          global counter
          for _ in range(100_000):
              with lock:
                  counter += 1
    `,
  },
  {
    id: 'cr-zero-grad',
    topic: 'Boucle d\'entraînement PyTorch',
    prompt: PROMPT,
    code: dedent`
      for epoch in range(epochs):
          for x, y in loader:
              logits = model(x)
              loss = F.cross_entropy(logits, y)
              loss.backward()
              optimizer.step()
    `,
    choices: [
      'Les gradients ne sont jamais remis à zéro : ils s\'accumulent d\'un batch à l\'autre',
      '`cross_entropy` attend des probabilités, il faut appliquer `softmax` avant',
      '`optimizer.step()` doit être appelé avant `loss.backward()`',
      'Il faut appeler `model.eval()` au début de chaque epoch',
    ],
    answer: 0,
    explanation:
      "`.backward()` **additionne** dans `.grad`. Sans `optimizer.zero_grad()` chaque step utilise la somme de tous les gradients passés. (Et `cross_entropy` attend bien des logits bruts : ajouter un softmax serait un second bug.)",
    fixedCode: dedent`
      model.train()
      for epoch in range(epochs):
          for x, y in loader:
              optimizer.zero_grad(set_to_none=True)
              loss = F.cross_entropy(model(x), y)
              loss.backward()
              optimizer.step()
    `,
  },
  {
    id: 'cr-inference-mode',
    topic: 'Inférence PyTorch',
    prompt: "Cette fonction d'évaluation donne des scores instables et consomme beaucoup de mémoire. Pourquoi ?",
    code: dedent`
      def evaluate(model, loader):
          correct = 0
          for x, y in loader:
              preds = model(x).argmax(dim=-1)
              correct += (preds == y).sum().item()
          return correct / len(loader.dataset)
    `,
    choices: [
      'Ni `model.eval()` (dropout/batchnorm actifs) ni `torch.no_grad()` (graphe construit)',
      '`argmax` doit porter sur `dim=0`',
      '`.item()` provoque une fuite mémoire',
      '`len(loader.dataset)` compte les batches, pas les exemples',
    ],
    answer: 0,
    explanation:
      "En mode train, le dropout reste actif et la BatchNorm utilise les stats du batch : résultats non déterministes. Sans `no_grad`/`inference_mode`, PyTorch garde les activations pour un backward qui n'arrivera jamais.",
    fixedCode: dedent`
      @torch.inference_mode()
      def evaluate(model, loader):
          model.eval()
          correct = 0
          for x, y in loader:
              correct += (model(x).argmax(dim=-1) == y).sum().item()
          return correct / len(loader.dataset)
    `,
  },
  {
    id: 'cr-blocking-async',
    topic: 'asyncio',
    prompt: 'Ce serveur async ne traite plus qu\'une requête à la fois. Pourquoi ?',
    code: dedent`
      import time
      import requests

      async def handle(request):
          time.sleep(0.5)  # rate limit
          r = requests.get(EMBEDDING_URL, params={"q": request.query})
          return r.json()
    `,
    choices: [
      '`time.sleep` et `requests` sont bloquants : ils gèlent toute la boucle d\'événements',
      'Il manque `await` devant `r.json()`',
      'Une coroutine ne peut pas renvoyer de dictionnaire',
      '`requests.get` doit être appelé dans un `try`/`finally`',
    ],
    answer: 0,
    explanation:
      "Dans une coroutine, tout appel bloquant monopolise l'unique thread de la boucle. Il faut `await asyncio.sleep()` et un client HTTP asynchrone (`httpx.AsyncClient`, `aiohttp`), ou déporter le code bloquant via `asyncio.to_thread`.",
    fixedCode: dedent`
      import asyncio
      import httpx

      client = httpx.AsyncClient(timeout=10)

      async def handle(request):
          await asyncio.sleep(0.5)  # rate limit
          r = await client.get(EMBEDDING_URL, params={"q": request.query})
          return r.json()
    `,
  },
  {
    id: 'cr-swallowed-exception',
    topic: "Gestion d'erreurs",
    prompt: PROMPT,
    code: dedent`
      def load_config(path):
          try:
              with open(path) as f:
                  return json.load(f)
          except:
              return {}
    `,
    choices: [
      'Le `except:` nu avale tout (même `KeyboardInterrupt`) et masque les configs invalides',
      'Le fichier n\'est jamais fermé',
      '`json.load` doit recevoir le chemin, pas le fichier',
      'Le `return` dans un `with` empêche la lecture',
    ],
    answer: 0,
    explanation:
      "Un JSON corrompu ou une erreur de permission se transforme silencieusement en config vide : le bug apparaîtra bien plus loin. On attrape uniquement les erreurs attendues, et on laisse remonter (ou on logge) les autres.",
    fixedCode: dedent`
      def load_config(path):
          try:
              with open(path, encoding="utf-8") as f:
                  return json.load(f)
          except FileNotFoundError:
              return {}
    `,
  },
];
