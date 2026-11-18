# Swagger 2.0 fixtures

28 documents, unchanged. Read 2026-11-18.

## The OpenAPI Specification's 2.0 examples

From [`OAI/OpenAPI-Specification`](https://github.com/OAI/OpenAPI-Specification) (Apache-2.0) at tag
`3.0.0`, commit `e9c539d86f080f133aa35c3e7db33ef004496625`, `examples/v2.0/yaml/<file>`, under
`oai/`: `api-with-examples.yaml`, `petstore-expanded.yaml`, `petstore-minimal.yaml`,
`petstore-simple.yaml`, `petstore-with-external-docs.yaml`, `petstore.yaml`, `uber.yaml`, and
`petstore-separate/spec/swagger.yaml` (8 documents). `petstore-separate/spec/{NewPet,Pet,parameters}.yaml`
and `petstore-separate/common/Error.yaml` are the files that document references, kept so its
references point at real files; they are not read as documents.

URL pattern: `https://raw.githubusercontent.com/OAI/OpenAPI-Specification/<commit>/examples/v2.0/yaml/<file>`.

## swagger-codegen's 2.0 test documents

From [`swagger-api/swagger-codegen`](https://github.com/swagger-api/swagger-codegen) (Apache-2.0) at
commit `c976cd058c8d3c7d297b501121470bfa9546f6e2`,
`modules/swagger-codegen/src/test/resources/2_0/<file>`, under `swagger-codegen/` (20 documents):
`petstore.yaml` (the Swagger Petstore 2.0, with `formData`, `type: file` and `collectionFormat`),
`allOfProperties.yaml`, `allOfTest.yaml`, `binaryDataTest.json`, `datePropertyTest.json`,
`discriminatorTest.json`, `duplicateOperationIds.yaml`, `fileResponseTest.json`,
`globalConsumesAndProduces.json`, `issue-10546.yaml`, `issue-7355.yaml`, `markdown.yaml`,
`pathWithHtmlEntity.yaml`, `petstore-security-test.yaml`, `postBodyTest.json`,
`recursive_model.yaml`, `requiredTest.json`, `responseCodeTest.yaml`, `responseHeaderTest.yaml`,
`responseSelectionTest.json`.

URL pattern: `https://raw.githubusercontent.com/swagger-api/swagger-codegen/<commit>/modules/swagger-codegen/src/test/resources/2_0/<file>`.

## Not here yet

The intent's 50 corpus documents are the corpus lane's pinned list; this folder grades the
adapter on the format's own examples until that list exists.
