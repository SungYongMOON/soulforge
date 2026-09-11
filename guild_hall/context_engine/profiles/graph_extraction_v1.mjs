// Experimental extraction profile for neo4j-graphrag (v0.9 §14: entity types,
// properties and relation criteria are test-time variables, not fixed contract).
// It names what to look for in engineering work records; it grants nothing and
// carries no endpoint or model — those come from the trusted binding. Schema
// enforcement is neo4j-graphrag's own GraphPruning: undeclared types, patterns
// and properties are pruned, and every entity must carry a name (EXISTENCE).
// Document and Chunk are the tool's lexical labels, so no entity type uses them.
const NODE_TYPES = [
  { label: 'Request', description: 'A request or instruction to produce or check something', properties: [{ name: 'name', type: 'STRING' }, { name: 'due', type: 'STRING' }] },
  { label: 'Deliverable', description: 'A requested output such as a report, slide deck, design note or test result', properties: [{ name: 'name', type: 'STRING' }] },
  { label: 'Decision', description: 'An agreed choice or confirmed value', properties: [{ name: 'name', type: 'STRING' }, { name: 'value', type: 'STRING' }] },
  { label: 'Change', description: 'A correction, cancellation or change to an earlier request, decision or condition', properties: [{ name: 'name', type: 'STRING' }] },
  { label: 'Commitment', description: 'A promise to do something, usually with a date', properties: [{ name: 'name', type: 'STRING' }, { name: 'due', type: 'STRING' }] },
  { label: 'Constraint', description: 'A condition, limit or specification value that work must respect', properties: [{ name: 'name', type: 'STRING' }, { name: 'value', type: 'STRING' }] },
  { label: 'Equipment', description: 'A system, device, component or test equipment', properties: [{ name: 'name', type: 'STRING' }] },
  { label: 'ReferencedDocument', description: 'A document, attachment or earlier material that the text refers to', properties: [{ name: 'name', type: 'STRING' }] },
  { label: 'Event', description: 'A meeting, review, test or submission that happened or is planned', properties: [{ name: 'name', type: 'STRING' }, { name: 'date', type: 'STRING' }] },
].map(type => ({ ...type, additional_properties: false }));

export const GRAPH_EXTRACTION_PROFILE = Object.freeze({
  profile_id: 'context-engine/graph-extraction-v1',
  profile_version: '0.2.0',
  max_concurrency: 1,
  schema: Object.freeze({
    node_types: NODE_TYPES,
    relationship_types: [
      { label: 'REQUESTS', description: 'A request asks for a deliverable' },
      { label: 'CONCERNS', description: 'Something is about a piece of equipment or a document' },
      { label: 'CHANGES', description: 'A change corrects, cancels or replaces a decision, constraint or request' },
      { label: 'COMMITS_TO', description: 'A commitment covers a deliverable or request' },
      { label: 'DECIDED_AT', description: 'A decision was made at an event' },
      { label: 'REFERENCES', description: 'Something refers to a referenced document' },
      { label: 'FOLLOWS_UP', description: 'A request follows up an earlier request or event' },
    ],
    patterns: [
      ['Request', 'REQUESTS', 'Deliverable'], ['Request', 'CONCERNS', 'Equipment'], ['Deliverable', 'CONCERNS', 'Equipment'],
      ['Change', 'CHANGES', 'Decision'], ['Change', 'CHANGES', 'Constraint'], ['Change', 'CHANGES', 'Request'],
      ['Commitment', 'COMMITS_TO', 'Deliverable'], ['Decision', 'DECIDED_AT', 'Event'], ['Constraint', 'CONCERNS', 'Equipment'],
      ['Request', 'REFERENCES', 'ReferencedDocument'], ['Request', 'FOLLOWS_UP', 'Request'], ['Request', 'FOLLOWS_UP', 'Event'],
    ],
    constraints: NODE_TYPES.map(type => ({ type: 'EXISTENCE', node_type: type.label, property_names: ['name'] })),
    additional_node_types: false,
    additional_relationship_types: false,
    additional_patterns: false,
  }),
});
