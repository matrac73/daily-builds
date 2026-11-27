/** A trimmed-down TheMealDB record, shaped like the real API answer. */
export function rawMeal(overrides = {}) {
  return {
    idMeal: '52772',
    strMeal: 'Teriyaki Chicken Casserole',
    strCategory: 'Chicken',
    strArea: 'Japanese',
    strInstructions: 'Preheat oven to 350° F.\r\n\r\nBake for 35 minutes.',
    strMealThumb: 'https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg',
    strTags: 'Meat,Casserole',
    strYoutube: 'https://www.youtube.com/watch?v=4aZr5hZXP_s',
    strSource: null,
    strIngredient1: 'Chicken',
    strIngredient2: ' Tomato ',
    strIngredient3: 'Salt',
    strIngredient4: '',
    strIngredient5: null,
    strMeasure1: '1 whole',
    strMeasure2: '2 chopped',
    strMeasure3: ' ',
    strMeasure4: '',
    strMeasure5: null,
    ...overrides,
  };
}

/** Builds a fetch stand-in that answers with the given responses in order. */
export function fakeFetch(...responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(calls.length, responses.length) - 1];
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchImpl, calls };
}

export const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
