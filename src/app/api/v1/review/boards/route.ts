import { handle } from "@server/core/api";
import { BOARDS, boardByKey, composition, currentMembers, seatsOf } from "@server/ai/review/board";

/**
 * The boards, their composition, and which seats the caller holds (AI-10).
 *
 * `constituted` is the number that matters: until it is true, the board cannot
 * approve anything, and the platform will not assess a citizen's health in a
 * serving deployment.
 */
export const GET = handle({ permission: "review:read" }, async ({ db, user }) => {
  void db;
  const boards = [];
  for (const definition of BOARDS) {
    const board = await boardByKey(definition.key);
    if (!board) continue;
    const members = await currentMembers(board.id);
    boards.push({
      key: board.key,
      name: board.name,
      module: board.module,
      requiredSeats: board.requiredSeats,
      reviewCadenceDays: board.reviewCadenceDays,
      composition: await composition(board.key),
      mySeats: await seatsOf(board.id, user.userId),
      members: members.map((m) => ({ id: m.id, userId: m.userId, seat: m.seat, credential: m.credential, appointedAt: m.appointedAt })),
    });
  }
  return { boards };
});
