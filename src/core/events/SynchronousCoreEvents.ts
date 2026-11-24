import {
    CoreEvent,
    CoreEventHandler,
    CoreEventName,
    CoreEvents,
    CoreEventPublisher,
    CoreUnsubscribe
} from "@/core/events/CoreEvents";

export class SynchronousCoreEvents implements CoreEvents, CoreEventPublisher {

    private readonly handlers = new Map<CoreEventName, Set<CoreEventHandler<CoreEvent>>>();

    public subscribe<TName extends CoreEventName>(
        name: TName,
        handler: CoreEventHandler<Extract<CoreEvent, { name: TName }>>
    ): CoreUnsubscribe {
        const handlersForName = this.handlers.get(name) ?? new Set<CoreEventHandler<CoreEvent>>();

        handlersForName.add(handler as CoreEventHandler<CoreEvent>);
        this.handlers.set(name, handlersForName);

        return () => {
            handlersForName.delete(handler as CoreEventHandler<CoreEvent>);

            if (handlersForName.size === 0) {
                this.handlers.delete(name);
            }
        };
    }

    public publish<TEvent extends CoreEvent>(event: TEvent): void {
        const handlersForName = this.handlers.get(event.name);

        if (!handlersForName) return;

        for (const handler of [...handlersForName]) {
            handler(event);
        }
    }

    public dispose(): void {
        this.handlers.clear();
    }

}
