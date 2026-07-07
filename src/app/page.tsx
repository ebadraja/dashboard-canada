// Minimal landing. Foundation (Doc 0) and the VA view (Doc 1) are built;
// Doctor (Doc 2) and Operator (Doc 3) views are next.
export default function Home() {
  return (
    <main>
      <h1>AI Receptionist</h1>
      <p>
        <a href="/login">Log in</a> · VAs: <a href="/va">open the rail</a> ·
        Health: <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
