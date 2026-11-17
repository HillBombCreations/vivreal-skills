# An in-memory MongoDB helper retries a port Windows refuses

`mongodb-memory-server` picks a free port, and on Windows that port can sit inside an excluded range
the OS reserves (Hyper-V, WSL and Docker reserve blocks; `netsh interface ipv4 show
excludedportrange protocol=tcp` lists them, and a Secure run on 2026-11-16 landed in 49409 to
49508). The start then fails with `listen EACCES`, which the library does not retry (it retries only
a port in use), so a full run dies while every file passes alone; three full CMS runs died this way.

- **The helper retries.** A test helper that starts the server retries on `EACCES` with a fresh
  port, a bounded number of times, logging each refused port.
- **Its own REFUSE test** feeds one `EACCES` and then a start, and asserts the helper started on the
  second port; a second test feeds `EACCES` past the bound and asserts the helper gives up with the
  ports it tried.
- **Until a repo's helper does,** a run that died on `EACCES` at a memory-server port is a harness
  failure to re-run, never a product result. vivreal-hq backlog F408 owns the CMS helper fix.
