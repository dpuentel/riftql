# T-008 — Native GraphQL Editor & Schema Docs Explorer

- **Status:** `TODO`
- **Area:** UI / GraphQL

## Scope
- GraphQL utilities (`INTROSPECTION_QUERY`, `buildSchemaFromIntrospection`, `extractOperations`, `formatGraphQL`, `extractSchemaSummary`).
- `GraphQLEditor` using `cm6-graphql` connected to per-endpoint cached `GraphQLSchema` for live autocomplete, hover types, and linting.
- Resizable Query/Mutation editor + JSON Variables editor, multi-operation selector (`operationName`), Format button, Fetch/Refresh Schema (reusing tab headers/auth/SSL/cookies).
- `SchemaDocsPanel` with search, breadcrumb drill-down, field signatures, argument types, and deprecation tags.

## Acceptance Criteria
- Unit tests for GraphQL parsing, operation extraction, formatting, and schema summary.
- Component tests for `SchemaDocsPanel` search and type navigation.
