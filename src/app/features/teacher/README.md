# features/teacher

[Português](#português) · [English](#english)

## Português

**Área bloqueada.** Esta pasta existe para registrar por que não há nada nela.

- Nenhuma rota do backend concede o papel de professor: é a decisão **P2** do `sinapse-platform`,
  em aberto.
- `GET /api/v1/me/state` não expõe `roles` (`StudentStateView`, lido em `sinapse-platform@c3abbff`),
  então este cliente não consegue descobrir se a conta é de professor — `docs/ai/STATE.md`, **F3**.
- O paliativo de ler um 403 de `GET /classrooms` é rejeitado: usa um código de erro como canal de
  informação.

Por isso não existem a casca do professor, as telas da área nem um *layout* para ela
(`CLAUDE.md`, *Hard prohibitions*; `docs/DESIGN_SYSTEM.md` §7 e §13). Construí-las sugeriria que a área funciona.

As quatro subpastas (`data/`, `model/`, `ui/`, `pages/`) existem só para seguir a regra de
`CLAUDE.md`, *Layout* e estão vazias de propósito.

**Desbloqueia quando:** o backend decidir P2 e expor `roles` em `/me/state`.

## English

**Blocked area.** This folder exists to record why there is nothing in it.

- No backend route grants the teacher role: decision **P2** of `sinapse-platform`, still open.
- `GET /api/v1/me/state` exposes no `roles` (`StudentStateView`, read at `sinapse-platform@c3abbff`),
  so this client cannot discover whether the account is a teacher — `docs/ai/STATE.md`, **F3**.
- The palliative of reading a 403 from `GET /classrooms` is rejected: it uses an error code as an
  information channel.

So there is no teacher shell, no screen and no layout for this area (`CLAUDE.md`, *Hard prohibitions*;
`docs/DESIGN_SYSTEM.md` §7 and §13). Building them would suggest that the area works.

The four subfolders (`data/`, `model/`, `ui/`, `pages/`) exist only to follow `CLAUDE.md`, *Layout* and are
empty on purpose.

**Unblocked when:** the backend decides P2 and exposes `roles` in `/me/state`.
