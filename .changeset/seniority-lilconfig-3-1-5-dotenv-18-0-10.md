---
"seniority": patch
---

`seniority/lilconfig` follows lilconfig 3.1.5 (81 / 81, control 81 / 81): a relative `searchFrom` and a relative or slash-ended `stopDir` are resolved against the working directory.

`seniority/dotenv`'s `dotenv run` follows dotenv 18.0.10 (198 / 198, control 198 / 198). When the command dies from a signal, the signal is re-raised as before. If that does not end the process, it now exits with `128 + signal` a second later instead of hanging. That is the case for a signal Node ignores, such as SIGPIPE (`dotenv run -- cmd | head`).
