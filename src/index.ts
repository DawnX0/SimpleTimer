import { ReplicatedStorage, RunService } from "@rbxts/services";

const FOLDER_NAME = "SIMPLESIGNALS";
const LINK_NAME = "TIMER";

// TIMER_STATUSES object with constant key names and lowercase values
const TIMER_STATUSES = {
	Started: "started",
	Completed: "completed",
	Paused: "paused",
	Running: "running",
	Stopped: "stopped",
} as const;

type TimerStatus = (typeof TIMER_STATUSES)[keyof typeof TIMER_STATUSES];
const Timers = new Map<string, ReturnType<SimpleTimer["CreateTimer"]>>();

type TimerInstance = {
	Name: string;
	Duration: number;
	Tick: number;
	RemainingTime: number;
	AutoDestroy: boolean;
	Status: TimerStatus;
	completed: BindableEvent;
	statusChanged: BindableEvent;
	onTick: BindableEvent;
	timerThread: undefined | thread;
	Start: () => void;
	Pause: () => void;
	Resume: () => void;
	Stop: () => void;
	Destroy: () => void;
};

class SimpleTimer {
	Signals = ReplicatedStorage.FindFirstChild(FOLDER_NAME) || new Instance("Folder", ReplicatedStorage);
	Link = (this.Signals.FindFirstChild(LINK_NAME) as RemoteEvent) || new Instance("RemoteEvent", this.Signals);

	constructor() {
		this.Signals.Name = FOLDER_NAME;
		this.Link.Name = LINK_NAME;
	}

	// Create a new timer
	CreateTimer(timerData: { Name: string; Duration: number; Tick?: number; AutoDestroy?: boolean }) {
		if (!RunService.IsServer()) error("Timers have to be created on the server");

		const { Name, Duration, Tick, AutoDestroy } = timerData;

		const timer: TimerInstance = {
			// Basic Information
			Name: Name,
			Duration: Duration,
			Tick: Tick || 1,
			RemainingTime: Duration,
			AutoDestroy: AutoDestroy || true,
			Status: TIMER_STATUSES.Stopped as TimerStatus,

			// Event instances
			completed: new Instance("BindableEvent"),
			statusChanged: new Instance("BindableEvent"),
			onTick: new Instance("BindableEvent"),

			// Thread placeholder
			timerThread: undefined,

			// Start the timer
			Start: () => this.Start(timer),
			// Pause the timer
			Pause: () => this.Pause(timer),
			// Resume the timer
			Resume: () => this.Resume(timer),
			// Stop the timer
			Stop: () => this.Stop(timer),
			// Destroy the timer
			Destroy: () => this.Destroy(timer),
		};

		Timers.set(Name, timer);
		return timer;
	}

	// Start a timer
	Start(timer: TimerInstance) {
		if (timer.Status === TIMER_STATUSES.Running) return;
		timer.Status = TIMER_STATUSES.Running;
		timer.timerThread = task.spawn(() => this.run(timer));
		timer.statusChanged.Fire();
	}

	// Pause a timer
	Pause(timer: TimerInstance) {
		if (timer.Status !== TIMER_STATUSES.Running) return;
		timer.Status = TIMER_STATUSES.Paused;
		timer.statusChanged.Fire();

		// Cancel the current timer thread
		if (timer.timerThread) {
			task.cancel(timer.timerThread);
			timer.timerThread = undefined;
		}
	}

	// Resume a paused timer
	Resume(timer: TimerInstance) {
		if (timer.Status !== TIMER_STATUSES.Paused) return;
		timer.Status = TIMER_STATUSES.Running;
		timer.timerThread = task.spawn(() => this.run(timer));
		timer.statusChanged.Fire();
	}

	// Stop a timer
	Stop(timer: TimerInstance) {
		if (timer.Status === TIMER_STATUSES.Stopped) return;
		timer.Status = TIMER_STATUSES.Stopped;
		timer.RemainingTime = timer.Duration; // Reset timer to the original duration
		timer.statusChanged.Fire();

		// Cancel the timer thread if running
		if (timer.timerThread) {
			task.cancel(timer.timerThread);
			timer.timerThread = undefined;
		}
	}

	// Destroy a timer
	Destroy(timer: TimerInstance) {
		timer.Status = TIMER_STATUSES.Stopped;

		// Destroy the event instances
		timer.completed.Destroy();
		timer.statusChanged.Destroy();

		// Cancel any running threads
		if (timer.timerThread) {
			coroutine.yield(timer.timerThread);
			task.cancel(timer.timerThread);
			timer.timerThread = undefined;
		}

		// Remove the timer from the global map
		Timers.delete(timer.Name);
		print(`Timer "${timer.Name}" has been destroyed.`);
	}

	Copy(timer: TimerInstance) {
		// Create a deep copy of the timer
		const copiedTimer: TimerInstance = {
			Name: timer.Name + "_copy", // Modify the name to avoid conflicts
			Duration: timer.Duration,
			Tick: timer.Tick,
			RemainingTime: timer.RemainingTime,
			AutoDestroy: timer.AutoDestroy,
			Status: timer.Status,

			// Create new BindableEvents to ensure the copied timer has independent event handling
			completed: new Instance("BindableEvent"),
			statusChanged: new Instance("BindableEvent"),
			onTick: new Instance("BindableEvent"),

			// No thread running at the time of copying
			timerThread: undefined,

			// Methods bound to the copied timer
			Start: () => this.Start(copiedTimer),
			Pause: () => this.Pause(copiedTimer),
			Resume: () => this.Resume(copiedTimer),
			Stop: () => this.Stop(copiedTimer),
			Destroy: () => this.Destroy(copiedTimer),
		};

		// Return the copied timer without setting it in the Timers map (the user may choose to do that later)
		return copiedTimer;
	}

	// Timer loop logic
	private run(timer: TimerInstance) {
		while (timer.RemainingTime > 0 && timer.Status === TIMER_STATUSES.Running) {
			task.wait(timer.Tick); // Wait for timer tick
			timer.onTick.Fire(timer.RemainingTime);
			timer.RemainingTime -= timer.Tick;

			if (timer.Status !== TIMER_STATUSES.Running) break;
		}

		// Timer completed
		if (timer.RemainingTime <= 0 && timer.Status === TIMER_STATUSES.Running) {
			timer.Status = TIMER_STATUSES.Completed;
			timer.completed.Fire(); // Fire completion event
			timer.statusChanged.Fire();
			timer.onTick.Fire(timer.RemainingTime);

			// If AutoDestroy is set, destroy the timer
			if (timer.AutoDestroy) {
				this.Destroy(timer);
			}
		}
	}
}

export default new SimpleTimer();
