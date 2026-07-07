import { requireUser, guardResponse } from "@/server/guard";
import { subscribe, type RailEvent } from "@/server/events";

// The live rail stream (Doc 1 §5: a ding within ~1s of the AI asking).
// Server-Sent Events over the authenticated session; VA-only, fenced to the
// VA's own clinic by the guard — the clinic id never comes from the client.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const caller = await requireUser(["va"]);
    if (!caller.clinicId) {
      return new Response("VA has no clinic", { status: 403 });
    }
    const clinicId = caller.clinicId;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const send = (event: RailEvent) => {
          controller.enqueue(
            encoder.encode(
              `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
            ),
          );
        };

        const unsubscribe = subscribe(clinicId, send);

        // Comment-line heartbeat keeps proxies from closing the stream.
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            /* stream already closed */
          }
        }, 25_000);

        // First byte confirms the subscription to the client.
        controller.enqueue(encoder.encode(`: connected\n\n`));

        req.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          unsubscribe();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return guardResponse(e);
  }
}
