# apicontract corpus — 2026-11-18-6951c9040b-full

One row per tool over the same sampled documents. A share counts only the documents where the step was reached and measured;
"read" is ours alone (an incumbent reads and generates in one step). "Usable" = generated and type-checked under TS 5.9, 6.0 and 7.0.
"Usable or refused" adds the documents where nothing was written and the error names its fix (`fix: …`), the same rule for every tool.

| Tool | Docs | Read | Generate | TS 5.9 | TS 6.0 | TS 7.0 | Usable | Usable or refused | Median ms | p90 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ours:types | 4265 | 100.0% (4263/4265) | 95.1% (4058/4265) | 94.0% (4011/4265) | 94.0% (4011/4265) | 94.0% (4011/4265) | 94.0% (4011/4265) | 98.8% (4215/4265) | 138 | 215 |
| hey-api | 4265 | — | 94.2% (4016/4265) | 94.2% (4016/4265) | 94.2% (4016/4265) | 94.2% (4016/4265) | 94.2% (4016/4265) | 94.2% (4016/4265) | 625 | 881 |
| openapi-typescript | 4265 | — | 49.1% (2093/4265) | 48.5% (2067/4265) | 48.5% (2067/4265) | 48.5% (2067/4265) | 48.5% (2067/4265) | 48.5% (2067/4265) | 566 | 691 |

## ours:types vs hey-api

Usable for hey-api only (where we lose): 13

- `apis-guru:APIs/apple.com/sirikit-cloud-media/1.0.2/openapi.yaml`
- `apis-guru:APIs/azure.com/recoveryservicessiterecovery-service/2016-08-10/swagger.yaml`
- `apis-guru:APIs/codat.io/banking/2.1.0/openapi.yaml`
- `apis-guru:APIs/conjur.local/5.3.0/openapi.yaml`
- `apis-guru:APIs/docusign.net/v2.1/openapi.yaml`
- `apis-guru:APIs/enode.io/1.3.10/openapi.yaml`
- `apis-guru:APIs/mercedes-benz.com/configurator/1.0/swagger.yaml`
- `apis-guru:APIs/nexmo.com/conversation/2.0.1/openapi.yaml`
- `apis-guru:APIs/opensuse.org/obs/2.10.50/openapi.yaml`
- `apis-guru:APIs/plaid.com/2020-09-14_1.345.1/openapi.yaml`
- `apis-guru:APIs/sendgrid.com/1.0.0/openapi.yaml`
- `apis-guru:APIs/twinehealth.com/v7.78.1/openapi.yaml`
- `apis-guru:APIs/vercel.com/0.0.1/openapi.yaml`

Usable for ours:types only: 8

- `apis-guru:APIs/beanstream.com/1.0.1/swagger.yaml`
- `apis-guru:APIs/blazemeter.com/4/swagger.yaml`
- `apis-guru:APIs/cpy.re/peertube/5.1.0/openapi.yaml`
- `apis-guru:APIs/microsoft.com/graph-beta/1.0.1/openapi.yaml`
- `apis-guru:APIs/rev.ai/v1/openapi.yaml`
- `apis-guru:APIs/rumble.run/2.15.0/openapi.yaml`
- `apis-guru:APIs/spotify.com/1.0.0/openapi.yaml`
- `apis-guru:APIs/vtex.local/Profile-System/1.0/openapi.yaml`

## ours:types vs openapi-typescript

Usable for openapi-typescript only (where we lose): 2

- `apis-guru:APIs/docusign.net/v2.1/openapi.yaml`
- `apis-guru:APIs/sendgrid.com/1.0.0/openapi.yaml`

Usable for ours:types only: 1946

- `apis-guru:APIs/1forge.com/0.0.1/swagger.yaml`
- `apis-guru:APIs/adafruit.com/2.0.0/swagger.yaml`
- `apis-guru:APIs/afterbanks.com/3.0.0/swagger.yaml`
- `apis-guru:APIs/aiception.com/1.0.0/swagger.yaml`
- `apis-guru:APIs/airport-web.appspot.com/v1/swagger.yaml`
- `apis-guru:APIs/akeneo.com/1.0.0/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-airline-code-lookup/1.1.1/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-airport-&-city-search/1.2.3/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-airport-nearest-relevant/1.1.2/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-airport-on-time-performance/1.0.4/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-branded-fares-upsell/1.0.1/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-flight-availabilities-search/1.0.2/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-flight-busiest-traveling-period/1.0.2/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-flight-cheapest-date-search/1.0.6/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-flight-check-in-links/2.1.2/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-flight-choice-prediction/2.0.2/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-flight-create-orders/1.9.0/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-flight-delay-prediction/1.0.6/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-flight-inspiration-search/1.0.6/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-flight-most-booked-destinations/1.1.1/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-flight-most-traveled-destinations/1.1.1/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-flight-offers-price/1.2.2/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-flight-order-management/1.9.0/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-hotel-booking/1.1.3/swagger.yaml`
- `apis-guru:APIs/amadeus.com/amadeus-hotel-name-autocomplete/1.0.3/swagger.yaml`
- … and 1921 more (see the jsonl)

## Most frequent errors

### ours:types

- 81 × `'.<path> at #<path> is in another file, .<path> which is not part of the document. fix: generate from the document's own file, so .<path>`
- 57 × `'.<path> at #<path> is in another file, .<path> which is not part of the document. fix: generate from the document's own file, so .<path> is read next to it, or`
- 23 × `'.<path> at #<path> is in another file, .<path> which is not part of the document. fix: generate from the document's own file, so .<path> is read nex…`
- 14 × `'.<path> at #<path> is in another file, .<path> which is not part of the document. fix: generate from the document's own file, so .<path> is read next …`
- 10 × `'.<path> at #<path> is in another file, .<path> which is not part of the document. fix: generate from the document's own file, so .<path> is rea…`

### hey-api

- 204 × `[Job 1] ❌ Input file not found:`
- 44 × `[Job 1] ❌ Failed with the message:`
- 1 × `timed out after 120000 ms`

### openapi-typescript

- 2169 × `Error: Unsupported Swagger version: 2.x. Use OpenAPI 3.x instead.`
- 2 × `✘  Can't resolve $ref: ENOENT: no such file or directory '<path> at #<path>`
- 1 × `✘  Can't resolve $ref: Failed to load https:<path> 400 Bad Request at #<path>`
