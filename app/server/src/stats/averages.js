export function officialThreeDartAverageExpr(
  scoreExpr = 'SUM(CASE WHEN d.busted = 0 THEN d.score_value ELSE 0 END)',
  dartExpr = 'COUNT(*)'
) {
  return `ROUND(((${scoreExpr}) * 3.0) / NULLIF(${dartExpr}, 0), 2)`;
}

