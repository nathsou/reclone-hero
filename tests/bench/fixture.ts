/** Deterministic dense chart; no user files or licensed assets required. */
export const FRAME_CHART = `[Song]
{
 Resolution = 192
}
[SyncTrack]
{
 0 = B 120000
}
[ExpertSingle]
{
${Array.from({ length: 3563 }, (_, i) => ` ${i * 48} = N ${i % 5} ${i % 7 === 0 ? 96 : 0}`).join('\n')}
}
`;
