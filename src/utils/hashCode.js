// @flow

// This is a non-secure but fast version of Java's String.hashCode method
/**
 *
 * @param {string} input
 * @return {number}
 */
export default (input) => {
  let hash = 0;
  if (input.length === 0) {
    return hash;
  }
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
};
