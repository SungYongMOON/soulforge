// Replace this connection with an in-process engine adapter, not its data types.
// Inputs have already passed Soulforge's binding and normalization guards.
export const literalCitationMatcher = Object.freeze({
  id: 'soulforge/literal-citation-v1',
  matches: ({ quote, source }) => quote === source,
});
