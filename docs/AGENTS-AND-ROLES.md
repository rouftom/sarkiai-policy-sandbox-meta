# Agents & AI registry

The registry lets an institution configure the agents the engine runs, instead
of a fixed list of mandated agents. It has three parts, each with its own screen
under **Agents & AI** and **Institutions** in the console, its own API and its
own version history.

| Part | Says | Screen | API |
|---|---|---|---|
| **Role** | What an agent does in the pipeline, built from fixed capabilities | Agents & AI › Roles | `/v1/registry/roles` |
| **Institution** | On whose behalf an agent speaks: country, mandate, legal basis in the corpus, domains, limits | Institutions › Institutions | `/v1/registry/institutions` |
| **Agent** | A role, an institution when the role is mandated, a Meta model, instructions, an information scope | Agents & AI › Agents | `/v1/registry/agents` |

The **Knowledge base** moved under Agents & AI, and **Countries** sits next to
Institutions; their pages and addresses did not change.

## Guarantees no setting can lift

These are enforced in code. No role, agent or instruction changes them, and the
console shows them on every registry screen (`GET /v1/registry/guarantees`).

| Guarantee | Where it holds |
|---|---|
| Every quote is checked against the corpus | The citation validator is code, not an agent. A `validator` role adds a model review; it never replaces or disables the check |
| A person decides every side effect | Agents propose actions; sends, deletions and approvals wait for an operator |
| Exercise scores follow rules | Addressed, late or missed are computed from the log; a model only writes the report |
| Only Meta models run | An agent's model must be a Meta model id (`muse-…`, `meta-models/…`), or empty for the operator's model |
| Only administrators change the registry | Every create, edit and status change is administrator-only |
| Every change is versioned and audited | Each save is a new version (`registry_versions`) and an audit record; runs record the agents they used |

## Roles and capabilities

A role is a set of capabilities. The capabilities are fixed because the engine
enforces each one:

`retrieve` (agentic corpus search) · `assess` · `advise` · `coordinate` ·
`escalate` · `review` · `propose_action` · `score` · `draft`

Built-in roles ship with the engine. Their capabilities cannot change; their
name and description can.

| Role | Capabilities | Speaks for an institution |
|---|---|---|
| `mandated` | retrieve, assess, escalate | yes |
| `legal_advisor` | retrieve, assess, advise | no |
| `coordinator` | coordinate, draft | no |
| `validator` | review, retrieve | no |
| `worker` | retrieve | no |
| `reporter` | draft | no |
| `evaluator` | retrieve, score | no |

An administrator can create other roles by combining capabilities.

## Institutions

An institution has a country (ISO 3166-1 alpha-2), a mandate, its domains, what
it must not do, and its **legal basis**: the provisions of the corpus that found
the mandate (`file#article · note`, one per line in the editor). The built-in
institutions come from the engine catalogue; an administrator can complete them,
for example by adding their legal basis, which saves a new version.

## Agents

An agent has a role, an institution when its role is mandated, an optional Meta
model (empty: the operator's chosen model), instructions appended to the role's
prompt, an information scope (`all_events`, `domain_events`, `addressed_events`)
and a colour for the graphs.

### Lifecycle

`draft` → `active` → `retired` (and back to `draft`). A new entry starts as a
draft. **Activation is refused** when:

- the role is not active;
- the role is mandated and the agent has no institution, or the institution is
  not active;
- the institution has no legal basis (built-in institutions excepted);
- the model is not a Meta model.

The console lists the reasons; the API answers `422 activation_blocked` with
`details`.

## In the work screens

| Screen | What changes |
|---|---|
| **Crisis scenarios** | Before a run, choose the agents taking part. Nothing chosen: every active agent of the sector. The choice is saved with the run, so a resumed run keeps it |
| **Assistant** | The institutions offered are the active agents of the registry. **Try in the assistant**, on an agent's page, opens the assistant with that agent pinned |
| **Exercise, timeline, processes** | Agent names come from the registry |

If the registry cannot be read, the engine falls back to the built-in catalogue:
a scenario never runs without agents.

## API

| Method and path | Who |
|---|---|
| `GET /v1/registry/guarantees` | signed-in operator |
| `GET /v1/registry/agent-specs?domains=&ids=` | signed-in operator |
| `GET /v1/registry/{roles,institutions,agents}` and `/:id`, `/:id/versions` | signed-in operator |
| `POST /v1/registry/{…}` (create, draft, version 1) | administrator |
| `PATCH /v1/registry/{…}/:id` (new version) | administrator |
| `POST /v1/registry/{…}/:id/status` (`draft`, `active`, `retired`) | administrator |

Every operation is documented in the API reference on `/docs`.

## Storage

MongoDB collections `registry_roles`, `registry_institutions`, `registry_agents`
and `registry_versions`. Built-in entries are not stored until an administrator
edits them; the stored version then overrides the built-in. Without MongoDB the
registry lives in memory, like the other operational stores.

## Not yet covered

- The observability screen still names agents from the built-in catalogue.
- The information scope is recorded on the agent; the scenario engine still
  applies its built-in information asymmetry.
- A per-agent test set before activation (see [`ROADMAP.md`](../ROADMAP.md), M5 and M11).
