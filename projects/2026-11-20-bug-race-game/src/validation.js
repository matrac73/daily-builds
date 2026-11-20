/**
 * Setup validation. A lane is `{ icon: string, name: string }`; lanes are
 * reported to the user with 1-based numbers.
 */

/**
 * Groups the indices of equal values, keeping only values that appear more
 * than once. Example: ['a', 'b', 'a'] -> [[0, 2]].
 */
export function findDuplicates(values) {
  const groups = new Map();
  values.forEach((value, index) => {
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(index);
  });
  return [...groups.values()].filter((indices) => indices.length > 1);
}

/** [0, 2, 3] -> "1, 3 and 4" */
export function formatLaneList(indices) {
  const numbers = indices.map((index) => String(index + 1));
  if (numbers.length < 2) return numbers.join('');
  return `${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`;
}

const normalizeName = (name) => name.trim().toLowerCase();

/**
 * Checks the lane configuration.
 * Shared icons only produce warnings; missing or repeated names are errors.
 */
export function validateSetup(lanes) {
  const warnings = findDuplicates(lanes.map((lane) => lane.icon)).map(
    (indices) =>
      `Lanes ${formatLaneList(indices)} use the same bug icon — they will be hard to tell apart.`,
  );

  const errors = [];
  const named = [];
  lanes.forEach((lane, index) => {
    if (normalizeName(lane.name) === '') {
      errors.push(`Lane ${index + 1} needs a name.`);
    } else {
      named.push(index);
    }
  });

  const duplicateNames = findDuplicates(named.map((index) => normalizeName(lanes[index].name)));
  for (const group of duplicateNames) {
    const indices = group.map((position) => named[position]);
    const name = lanes[indices[0]].name.trim();
    errors.push(
      `Lanes ${formatLaneList(indices)} share the name “${name}”. Every bug needs a unique name.`,
    );
  }

  return { warnings, errors };
}

/**
 * Everything that must hold before a race may start: a valid setup plus a
 * predicted winner (`pick` is a lane index, or null when nothing is selected).
 */
export function validateStart(lanes, pick) {
  const { warnings, errors } = validateSetup(lanes);
  const hasPick = Number.isInteger(pick) && pick >= 0 && pick < lanes.length;
  if (!hasPick) errors.push('Pick the bug you think will win before starting the race.');
  return { warnings, errors };
}
