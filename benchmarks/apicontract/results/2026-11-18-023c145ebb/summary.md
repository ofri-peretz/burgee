# apicontract corpus — 2026-11-18-023c145ebb

One row per tool over the same sampled documents. A share counts only the documents where the step was reached and measured;
"read" is ours alone (an incumbent reads and generates in one step). "Usable" = generated and type-checked under TS 5.9, 6.0 and 7.0.

| Tool | Docs | Read | Generate | TS 5.9 | TS 6.0 | TS 7.0 | Usable | Median ms | p90 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ours:types | 100 | 100.0% (100/100) | 50.0% (50/100) | 50.0% (50/100) | 50.0% (50/100) | 50.0% (50/100) | 50.0% (50/100) | 124 | 205 |
| hey-api | 100 | — | 92.0% (92/100) | 92.0% (92/100) | 92.0% (92/100) | 92.0% (92/100) | 92.0% (92/100) | 562 | 637 |
| openapi-typescript | 100 | — | 50.0% (50/100) | 50.0% (50/100) | 50.0% (50/100) | 50.0% (50/100) | 50.0% (50/100) | 414 | 519 |

## ours:types vs hey-api

Usable for hey-api only (where we lose): 42

- `apis-guru:APIs/amadeus.com/amadeus-flight-inspiration-search/1.0.6/swagger.yaml`
- `apis-guru:APIs/azure.com/apimanagement-apimapis/2018-06-01-preview/swagger.yaml`
- `apis-guru:APIs/azure.com/apimanagement-apimbackends/2017-03-01/swagger.yaml`
- `apis-guru:APIs/azure.com/apimanagement-apimidentityprovider/2018-01-01/swagger.yaml`
- `apis-guru:APIs/azure.com/apimanagement-apimnotifications/2018-06-01-preview/swagger.yaml`
- `apis-guru:APIs/azure.com/apimanagement-apimpolicies/2018-06-01-preview/swagger.yaml`
- `apis-guru:APIs/azure.com/apimanagement-apimproperties/2018-01-01/swagger.yaml`
- `apis-guru:APIs/azure.com/authorization-authorization-ClassicAdminCalls/2015-06-01/swagger.yaml`
- `apis-guru:APIs/azure.com/azsadmin-Backup/2018-09-01/swagger.yaml`
- `apis-guru:APIs/azure.com/azsadmin-containers/2015-12-01-preview/swagger.yaml`
- `apis-guru:APIs/azure.com/cognitiveservices-AnomalyDetector/1.0/swagger.yaml`
- `apis-guru:APIs/azure.com/cognitiveservices-AnomalyFinder/2.0/swagger.yaml`
- `apis-guru:APIs/azure.com/consumption/2018-08-31/swagger.yaml`
- `apis-guru:APIs/azure.com/containerregistry/2016-06-27-preview/swagger.yaml`
- `apis-guru:APIs/azure.com/keyvault-secrets/2019-09-01/swagger.yaml`
- `apis-guru:APIs/azure.com/managementgroups-management/2018-03-01-preview/swagger.yaml`
- `apis-guru:APIs/azure.com/monitor-actionGroups_API/2018-03-01/swagger.yaml`
- `apis-guru:APIs/azure.com/mysql-PrivateEndpointConnections/2018-06-01/swagger.yaml`
- `apis-guru:APIs/azure.com/network-networkWatcher/2019-06-01/swagger.yaml`
- `apis-guru:APIs/azure.com/network-publicIpPrefix/2019-06-01/swagger.yaml`
- `apis-guru:APIs/azure.com/network-serviceCommunity/2016-12-01/swagger.yaml`
- `apis-guru:APIs/azure.com/network-usage/2017-11-01/swagger.yaml`
- `apis-guru:APIs/azure.com/network-usage/2019-06-01/swagger.yaml`
- `apis-guru:APIs/azure.com/network-virtualNetworkGateway/2017-06-01/swagger.yaml`
- `apis-guru:APIs/azure.com/network-virtualNetworkGateway/2018-04-01/swagger.yaml`
- … and 17 more (see the jsonl)

Usable for ours:types only: 0

- none

## ours:types vs openapi-typescript

Usable for openapi-typescript only (where we lose): 0

- none

Usable for ours:types only: 0

- none

## Most frequent errors

### ours:types

- 50 × `no input format recognises this document. fix: pass one of: openapi; or install the plugin that reads it`

### hey-api

- 8 × `exit 0, no output`

### openapi-typescript

- 50 × `Error: Unsupported Swagger version: 2.x. Use OpenAPI 3.x instead.`
