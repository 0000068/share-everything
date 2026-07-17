function describeFailure(name, reason) {
  const message = reason instanceof Error ? reason.message : String(reason);
  return new Error(`${name}: ${message}`, { cause: reason });
}

export async function runNamedCleanupTasks(tasks, message = "Cleanup failed") {
  const normalizedTasks = Array.isArray(tasks) ? tasks : [];
  const results = await Promise.allSettled(normalizedTasks.map(async ({ run }) => run()));
  const failures = results.flatMap((result, index) => (
    result.status === "rejected"
      ? [{
        name: normalizedTasks[index]?.name || `cleanup-${index + 1}`,
        reason: result.reason,
      }]
      : []
  ));

  if (failures.length === 0) return;
  throw new AggregateError(
    failures.map(({ name, reason }) => describeFailure(name, reason)),
    `${message}: ${failures.map(({ name }) => name).join(", ")}`,
  );
}
