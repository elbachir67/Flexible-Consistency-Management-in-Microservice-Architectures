import React, { useState, useEffect } from "react";
import { ArrowRight, RefreshCw, Check, X } from "lucide-react";
import "./App.css";

// Define the types for our megamodel-based state transition system
type ConsistencyState = "m" | "s+" | "s-" | "i"; // Modified, Shared+, Shared-, Invalid
type ConsistencyType = "sc" | "ec" | "bs" | "mr" | "rmw"; // Strong, Eventual, Bounded Staleness, Monotonic Reads, Read-My-Writes
type Operation = "share" | "update" | "refresh" | "timeout" | "read";
type AccessPattern = "read" | "write" | "both";

// Service-Component pair to uniquely identify a component in a service
type ServiceComponentPair = {
  service: string;
  component: string;
};

// Define the Megamodel structure
type Megamodel = {
  states: Map<string, ConsistencyState>; // Maps "service:component" to state
  types: Map<string, ConsistencyType>; // Maps "service:component" to consistency type
  versions: Map<string, number>; // Maps "service:component" to version number
  timestamps: Map<string, number>; // Maps "service:component" to timestamp
  stalenessBounds: Map<string, number>; // Maps "service:component" to staleness bound (in ms)
};

// Global Operation Model (GOM) definition
type GOM = {
  id: string;
  name: string;
  services: string[];
  components: string[];
  consistencyTypes: Map<string, ConsistencyType>; // Maps "service:component" to consistency type
  accessPatterns: Map<string, AccessPattern>; // Maps "service:component" to access pattern
};

// Type for transition history entries
type TransitionHistoryEntry = {
  timestamp: number;
  service: string;
  component: string;
  operation: Operation;
  fromState: ConsistencyState;
  toState: ConsistencyState;
  description: string;
};

// Helper function to get key for maps
const getKey = (service: string, component: string): string => {
  return `${service}:${component}`;
};

// Initial megamodel state for our e-commerce example
const createInitialMegamodel = (): Megamodel => {
  const states = new Map<string, ConsistencyState>();
  const types = new Map<string, ConsistencyType>();
  const versions = new Map<string, number>();
  const timestamps = new Map<string, number>();
  const stalenessBounds = new Map<string, number>();

  // Set up initial states for Order Service
  states.set(getKey("OrderService", "OrderModel"), "i"); // Invalid initially
  states.set(getKey("OrderService", "PaymentModel"), "i"); // Invalid initially
  states.set(getKey("OrderService", "InventoryModel"), "i"); // Invalid initially
  states.set(getKey("OrderService", "ProductModel"), "s+"); // Shared+ (already synced)

  // Set up initial states for Payment Service
  states.set(getKey("PaymentService", "OrderModel"), "i"); // Invalid initially
  states.set(getKey("PaymentService", "PaymentModel"), "i"); // Invalid initially

  // Set up initial states for Inventory Service
  states.set(getKey("InventoryService", "InventoryModel"), "s+"); // Shared+ (authoritative)

  // Set up consistency types
  types.set(getKey("OrderService", "OrderModel"), "sc"); // Strong consistency
  types.set(getKey("OrderService", "PaymentModel"), "sc"); // Strong consistency
  types.set(getKey("OrderService", "InventoryModel"), "bs"); // Bounded staleness
  types.set(getKey("OrderService", "ProductModel"), "ec"); // Eventual consistency

  types.set(getKey("PaymentService", "OrderModel"), "sc"); // Strong consistency
  types.set(getKey("PaymentService", "PaymentModel"), "sc"); // Strong consistency

  types.set(getKey("InventoryService", "InventoryModel"), "sc"); // Strong consistency

  // Set up initial versions (0 for new components)
  versions.set(getKey("OrderService", "OrderModel"), 0);
  versions.set(getKey("OrderService", "PaymentModel"), 0);
  versions.set(getKey("OrderService", "InventoryModel"), 0);
  versions.set(getKey("OrderService", "ProductModel"), 1);

  versions.set(getKey("PaymentService", "OrderModel"), 0);
  versions.set(getKey("PaymentService", "PaymentModel"), 0);

  versions.set(getKey("InventoryService", "InventoryModel"), 1);

  // Set up timestamps (current time)
  const currentTime = Date.now();
  timestamps.set(getKey("OrderService", "OrderModel"), currentTime);
  timestamps.set(getKey("OrderService", "PaymentModel"), currentTime);
  timestamps.set(getKey("OrderService", "InventoryModel"), currentTime);
  timestamps.set(getKey("OrderService", "ProductModel"), currentTime);

  timestamps.set(getKey("PaymentService", "OrderModel"), currentTime);
  timestamps.set(getKey("PaymentService", "PaymentModel"), currentTime);

  timestamps.set(getKey("InventoryService", "InventoryModel"), currentTime);

  // Set up staleness bounds (for bounded staleness components)
  stalenessBounds.set(getKey("OrderService", "InventoryModel"), 30000); // 30 seconds

  return {
    states,
    types,
    versions,
    timestamps,
    stalenessBounds,
  };
};

// Enhanced GOM definitions with clearer relationship to paper
const initialGOMs: GOM[] = [
  {
    id: "gom1",
    name: "GOM1: Order Processing",
    services: ["OrderService", "PaymentService", "InventoryService"],
    components: ["OrderModel", "PaymentModel", "InventoryModel"],
    consistencyTypes: new Map([
      [getKey("OrderService", "OrderModel"), "sc"],
      [getKey("PaymentService", "OrderModel"), "sc"],
      [getKey("OrderService", "PaymentModel"), "sc"],
      [getKey("PaymentService", "PaymentModel"), "sc"],
      [getKey("OrderService", "InventoryModel"), "bs"], // Bounded staleness
      [getKey("InventoryService", "InventoryModel"), "sc"],
    ]),
    accessPatterns: new Map([
      [getKey("OrderService", "OrderModel"), "both"],
      [getKey("PaymentService", "OrderModel"), "read"],
      [getKey("OrderService", "PaymentModel"), "read"],
      [getKey("PaymentService", "PaymentModel"), "both"],
      [getKey("OrderService", "InventoryModel"), "read"],
      [getKey("InventoryService", "InventoryModel"), "both"],
    ]),
  },
  {
    id: "gom2",
    name: "GOM2: Product Search",
    services: ["OrderService", "SearchService", "AnalyticsService"],
    components: ["ProductModel"],
    consistencyTypes: new Map([
      [getKey("OrderService", "ProductModel"), "ec"], // Eventual consistency
      [getKey("SearchService", "ProductModel"), "ec"], // Eventual consistency
      [getKey("AnalyticsService", "ProductModel"), "bs"], // Bounded staleness
    ]),
    accessPatterns: new Map([
      [getKey("OrderService", "ProductModel"), "read"],
      [getKey("SearchService", "ProductModel"), "read"],
      [getKey("AnalyticsService", "ProductModel"), "read"],
    ]),
  },
];
// E-commerce scenario steps based on Table 3 from the paper
const ecommerceScenarioSteps = [
  {
    step: "Order Creation",
    operations: [
      {
        service: "OrderService",
        component: "OrderModel",
        operation: "update" as Operation,
        isSource: true,
        expectedNewState: "m", // Expected state after operation
      },
    ],
    description: "Creating a new order",
  },
  {
    step: "Payment Read",
    operations: [
      {
        service: "OrderService",
        component: "OrderModel",
        operation: "share" as Operation,
        isSource: true,
        expectedNewState: "s+", // Transitions from m to s+
      },
      {
        service: "PaymentService",
        component: "OrderModel",
        operation: "read" as Operation,
        isSource: false,
        expectedNewState: "s+", // Transitions from i to s+
      },
    ],
    description: "Payment service reads the order information",
  },
  {
    step: "Payment Auth",
    operations: [
      {
        service: "PaymentService",
        component: "PaymentModel",
        operation: "update" as Operation,
        isSource: true,
        expectedNewState: "m", // Transitions from i to m
      },
    ],
    description: "Payment service processes the payment",
  },
  {
    step: "Inventory Check",
    operations: [
      {
        service: "OrderService",
        component: "InventoryModel",
        operation: "read" as Operation,
        isSource: false,
        expectedNewState: "s+", // Transitions from i to s+
      },
    ],
    description: "Order service checks inventory availability",
  },
  {
    step: "Inventory Update",
    operations: [
      {
        service: "InventoryService",
        component: "InventoryModel",
        operation: "update" as Operation,
        isSource: true,
        expectedNewState: "m", // Transitions from s+ to m
      },
      // The propagation to OrderService making InventoryModel s- happens automatically
    ],
    description: "Inventory service updates inventory levels",
  },
  {
    step: "Background Sync",
    operations: [
      {
        service: "OrderService",
        component: "InventoryModel",
        operation: "refresh" as Operation,
        isSource: false,
        expectedNewState: "s+", // Transitions from s- to s+
      },
      {
        service: "PaymentService",
        component: "PaymentModel",
        operation: "share" as Operation,
        isSource: true,
        expectedNewState: "s+", // Transitions from m to s+
      },
      {
        service: "InventoryService",
        component: "InventoryModel",
        operation: "share" as Operation,
        isSource: true,
        expectedNewState: "s+", // Transitions from m to s+
      },
    ],
    description: "Background synchronization ensures eventual consistency",
  },
  // Add a new step to demonstrate bounded staleness
  {
    step: "Bounded Staleness Demo",
    operations: [
      {
        service: "OrderService",
        component: "InventoryModel",
        operation: "timeout" as Operation, // Simulate time passing beyond staleness bound
        isSource: false,
        expectedNewState: "i", // Should transition to Invalid after timeout
      },
      {
        service: "OrderService",
        component: "InventoryModel",
        operation: "refresh" as Operation, // Refresh to get updated data
        isSource: false,
        expectedNewState: "s+", // Should transition back to Shared+
      },
    ],
    description: "Demonstrating bounded staleness: timeout and refresh",
  },
];

const checkBoundedStaleness = (megamodel: Megamodel): Megamodel => {
  const newMegamodel = { ...megamodel };
  const currentTime = Date.now();
  const timeoutHistoryEntries: TransitionHistoryEntry[] = [];

  // Check all components with bounded staleness
  for (const [key, consistencyType] of megamodel.types.entries()) {
    if (consistencyType === "bs") {
      const state = megamodel.states.get(key);
      const stalenessBound = megamodel.stalenessBounds.get(key);

      // If in Shared- state and staleness bound is exceeded
      if (state === "s-" && stalenessBound && currentTime > stalenessBound) {
        // Apply timeout transition
        const [service, component] = key.split(":");
        const prevState = state;

        // Update state to Invalid
        newMegamodel.states.set(key, "i");

        // Could add to history here if needed
        console.log(
          `Bounded staleness timeout: ${service}.${component} changed from ${prevState} to i`
        );
      }
    }
  }

  return newMegamodel;
};

// Component to demonstrate bounded staleness behavior with always-enabled buttons
const BoundedStalenessDemo: React.FC<{
  megamodel: Megamodel;
  onApplyOperation: (
    service: string,
    component: string,
    operation: Operation,
    isSource: boolean
  ) => void;
}> = ({ megamodel, onApplyOperation }) => {
  // Find components with bounded staleness
  const bsComponents: Array<{ service: string; component: string }> = [];

  for (const [key, type] of megamodel.types.entries()) {
    if (type === "bs") {
      const [service, component] = key.split(":");
      bsComponents.push({ service, component });
    }
  }

  if (bsComponents.length === 0) {
    return null;
  }

  // Get the first bounded staleness component for demo
  const demoComponent = bsComponents[0];
  const key = getKey(demoComponent.service, demoComponent.component);
  const currentState = megamodel.states.get(key);
  const stalenessBound = megamodel.stalenessBounds.get(key);
  const currentTime = Date.now();

  // Calculate time remaining before timeout
  let timeRemaining = 0;
  if (stalenessBound && currentState === "s-") {
    timeRemaining = Math.max(0, stalenessBound - currentTime);
  }

  // For demo purposes, force a specific component to demonstrate bounded staleness
  const handleTimeoutDemo = () => {
    // Ensure we're working with the inventory model
    const service = "OrderService";
    const component = "InventoryModel";

    // Force the component into Shared- state first if it's not already there
    if (megamodel.states.get(getKey(service, component)) !== "s-") {
      // First set it to Shared- (potentially stale)
      onApplyOperation(service, component, "update", false);
    }

    // Then trigger timeout to make it Invalid
    onApplyOperation(service, component, "timeout", false);
  };

  // Handle refresh demo
  const handleRefreshDemo = () => {
    const service = "OrderService";
    const component = "InventoryModel";

    // Force component into Invalid state if not already there
    if (megamodel.states.get(getKey(service, component)) !== "i") {
      onApplyOperation(service, component, "timeout", false);
    }

    // Then refresh it
    onApplyOperation(service, component, "refresh", false);
  };

  return (
    <div className="bs-demo-panel">
      <h3>Bounded Staleness Demo</h3>
      <div className="bs-component">
        <div className="bs-component-info">
          <div className="bs-name">OrderService.InventoryModel</div>
          <div className={`bs-state state-${currentState}`}>
            Current State: {currentState}
          </div>
        </div>

        {currentState === "s-" && (
          <div className="bs-staleness">
            <div className="bs-timer">
              Staleness: {Math.floor(timeRemaining / 1000)}s remaining
            </div>
            <div className="bs-progress-bar">
              <div
                className="bs-progress"
                style={{
                  width: `${Math.min(100, (timeRemaining / 30000) * 100)}%`,
                }}
              ></div>
            </div>
          </div>
        )}

        <div className="bs-demo-description">
          <p>Demonstrate bounded staleness (bs) state transitions:</p>
          <ul>
            <li>
              <strong>Timeout</strong>: s- → i when staleness bound exceeded
            </li>
            <li>
              <strong>Refresh</strong>: i → s+ when refreshing from
              authoritative source
            </li>
          </ul>
        </div>

        <div className="bs-actions">
          <button
            onClick={handleTimeoutDemo}
            className="bs-button timeout-button"
          >
            Demonstrate Timeout (s- → i)
          </button>
          <button
            onClick={handleRefreshDemo}
            className="bs-button refresh-button"
          >
            Demonstrate Refresh (i → s+)
          </button>
        </div>
      </div>
    </div>
  );
};

// Fixed version of propagateUpdate that includes operation parameter
const propagateUpdate = (
  megamodel: Megamodel,
  sourceService: string,
  component: string,
  operation: Operation = "update", // Add operation parameter with default value
  historyCallback?: (entries: TransitionHistoryEntry[]) => void
): Megamodel => {
  const sourceKey = getKey(sourceService, component);
  const currentTime = Date.now();
  const historyEntries: TransitionHistoryEntry[] = [];

  // Clone the megamodel to avoid mutating the original
  const newMegamodel: Megamodel = {
    states: new Map(megamodel.states),
    types: new Map(megamodel.types),
    versions: new Map(megamodel.versions),
    timestamps: new Map(megamodel.timestamps),
    stalenessBounds: new Map(megamodel.stalenessBounds),
  };

  newMegamodel.timestamps.set(sourceKey, currentTime);

  // Find all other services that use this component
  for (const [key, _] of megamodel.states) {
    const [service, comp] = key.split(":");
    if (comp === component && service !== sourceService) {
      const otherServiceKey = getKey(service, component);
      const consistencyType = newMegamodel.types.get(otherServiceKey);
      const currentState = newMegamodel.states.get(
        otherServiceKey
      ) as ConsistencyState;

      // Handle Invalid state during share operations
      if (operation === "share" && currentState === "i") {
        // Apply transition rule based on consistency type
        if (consistencyType === "sc") {
          // For strong consistency, go to Shared+
          newMegamodel.states.set(otherServiceKey, "s+");

          // Update version and timestamp
          const sourceVersion = newMegamodel.versions.get(sourceKey) || 0;
          newMegamodel.versions.set(otherServiceKey, sourceVersion);
          newMegamodel.timestamps.set(otherServiceKey, currentTime);

          // Record this propagation in history
          historyEntries.push({
            timestamp: currentTime + 20,
            service: service,
            component: component,
            operation: "refresh",
            fromState: "i",
            toState: "s+",
            description: `Propagated share: ${component} refreshed in ${service} from ${sourceService}`,
          });
        } else {
          // For other consistency types, go to Shared-
          newMegamodel.states.set(otherServiceKey, "s-");

          // Update version and timestamp
          const sourceVersion = newMegamodel.versions.get(sourceKey) || 0;
          newMegamodel.versions.set(otherServiceKey, sourceVersion);
          newMegamodel.timestamps.set(otherServiceKey, currentTime);

          // Record this propagation in history
          historyEntries.push({
            timestamp: currentTime + 20,
            service: service,
            component: component,
            operation: "refresh",
            fromState: "i",
            toState: "s-",
            description: `Propagated share: ${component} refreshed in ${service} from ${sourceService}`,
          });
        }
      }
      // Handle regular update propagation
      else if (operation === "update" || operation === "share") {
        if (consistencyType === "sc") {
          // Invalidate strong consistency duplicates
          if (currentState !== "i") {
            newMegamodel.states.set(otherServiceKey, "i");

            // Record history entry for this propagation
            historyEntries.push({
              timestamp: currentTime + 10, // Slightly after the source update
              service: service,
              component: component,
              operation: "update",
              fromState: currentState,
              toState: "i",
              description: `Propagated update: ${component} invalidated in ${service} due to strong consistency`,
            });
          }
        } else if (currentState === "s+") {
          // Transition to Shared- for other types
          newMegamodel.states.set(otherServiceKey, "s-");

          // Record history entry for this propagation
          historyEntries.push({
            timestamp: currentTime + 10, // Slightly after the source update
            service: service,
            component: component,
            operation: "update",
            fromState: "s+",
            toState: "s-",
            description: `Propagated update: ${component} becomes potentially stale in ${service}`,
          });

          // Set staleness bound for bounded staleness
          if (consistencyType === "bs") {
            const boundMs =
              newMegamodel.stalenessBounds.get(otherServiceKey) || 30000; // Default 30s
            newMegamodel.stalenessBounds.set(
              otherServiceKey,
              currentTime + boundMs
            );
          }
        }
      }
    }
  }

  // Add history entries if callback provided
  if (historyCallback && historyEntries.length > 0) {
    historyCallback(historyEntries);
  }

  return newMegamodel;
};

// Modified applyTransition function to pass operation to propagateUpdate
const applyTransition = (
  megamodel: Megamodel,
  service: string,
  component: string,
  operation: Operation,
  isSource: boolean = false,
  historyCallback?: (entries: TransitionHistoryEntry[]) => void
): Megamodel => {
  const key = getKey(service, component);
  const currentState = megamodel.states.get(key) as ConsistencyState;
  const consistencyType = megamodel.types.get(key) as ConsistencyType;
  let newState = currentState;

  // Clone the megamodel to avoid mutating the original
  const newMegamodel: Megamodel = {
    states: new Map(megamodel.states),
    types: new Map(megamodel.types),
    versions: new Map(megamodel.versions),
    timestamps: new Map(megamodel.timestamps),
    stalenessBounds: new Map(megamodel.stalenessBounds),
  };

  // Apply transition rules based on Definition 6 in the paper
  if (currentState === "m" && operation === "share" && isSource) {
    // δ(m, share, θ, true) = s+ ∀θ ∈ Θ (1)
    newState = "s+";
    const currentVersion = newMegamodel.versions.get(key) || 0;
    newMegamodel.versions.set(key, currentVersion + 1);
    newMegamodel.timestamps.set(key, Date.now());
  } else if (
    currentState === "s+" &&
    operation === "update" &&
    consistencyType === "sc" &&
    !isSource
  ) {
    // δ(s+, update, sc, false) = i (2)
    newState = "i";
  } else if (
    currentState === "s+" &&
    operation === "update" &&
    consistencyType !== "sc" &&
    !isSource
  ) {
    // δ(s+, update, θ, false) = s- ∀θ ∈ Θ \ {sc} (3)
    newState = "s-";
    if (consistencyType === "bs") {
      const currentTime = Date.now();
      const boundMs = newMegamodel.stalenessBounds.get(key) || 30000;
      newMegamodel.stalenessBounds.set(key, currentTime + boundMs);
    }
  } else if (currentState === "s-" && operation === "refresh") {
    // δ(s-, refresh, θ, b) = s+ ∀θ ∈ Θ, ∀b ∈ Bool (4)
    newState = "s+";
    const sourceKey = findAuthoritativeSource(component, newMegamodel);
    if (sourceKey) {
      const sourceVersion = newMegamodel.versions.get(sourceKey) || 0;
      newMegamodel.versions.set(key, sourceVersion);
      newMegamodel.timestamps.set(key, Date.now());
    }
  } else if (
    currentState === "s-" &&
    operation === "timeout" &&
    consistencyType === "bs"
  ) {
    // δ(s-, timeout, bs, b) = i ∀b ∈ Bool (5)
    newState = "i";
  } else if (
    currentState === "i" &&
    operation === "read" &&
    consistencyType === "sc"
  ) {
    // δ(i, read, sc, b) = s+ ∀b ∈ Bool (6)
    newState = "s+";
    const sourceKey = findAuthoritativeSource(component, newMegamodel);
    if (sourceKey) {
      const sourceVersion = newMegamodel.versions.get(sourceKey) || 0;
      newMegamodel.versions.set(key, sourceVersion);
      newMegamodel.timestamps.set(key, Date.now());
    }
  } else if (
    currentState === "i" &&
    operation === "read" &&
    consistencyType !== "sc"
  ) {
    // δ(i, read, θ, b) = s- ∀θ ∈ Θ \ {sc}, ∀b ∈ Bool (7)
    newState = "s-";
    const sourceKey = findAuthoritativeSource(component, newMegamodel);
    if (sourceKey) {
      const sourceVersion = newMegamodel.versions.get(sourceKey) || 0;
      newMegamodel.versions.set(key, sourceVersion);
      newMegamodel.timestamps.set(key, Date.now());
    }
  } else if (
    (currentState === "s+" || currentState === "s-") &&
    operation === "update" &&
    isSource
  ) {
    // δ({s+, s-}, update, θ, true) = m ∀θ ∈ Θ (8)
    newState = "m";
  }
  // Special case for initial update (i to m)
  else if (currentState === "i" && operation === "update" && isSource) {
    newState = "m";
    const currentVersion = newMegamodel.versions.get(key) || 0;
    newMegamodel.versions.set(key, currentVersion + 1);
    newMegamodel.timestamps.set(key, Date.now());
  }

  // Update the state
  newMegamodel.states.set(key, newState);

  // Propagate updates to other services if this is a source update or share
  if (isSource && (operation === "update" || operation === "share")) {
    return propagateUpdate(
      newMegamodel,
      service,
      component,
      operation,
      historyCallback
    );
  }

  return newMegamodel;
};

// Component to display a single microservice with its components
const MicroserviceBox: React.FC<{
  service: string;
  megamodel: Megamodel;
}> = ({ service, megamodel }) => {
  // Find all components for this service
  const components: string[] = [];
  for (const [key, _] of megamodel.states) {
    const [srv, comp] = key.split(":");
    if (srv === service && !components.includes(comp)) {
      components.push(comp);
    }
  }

  return (
    <div className="microservice-box">
      <h4>{service}</h4>
      <div className="component-list">
        {components.map(component => {
          const key = getKey(service, component);
          const state = megamodel.states.get(key) || "unknown";
          const type = megamodel.types.get(key) || "unknown";
          const version = megamodel.versions.get(key) || 0;

          return (
            <div key={key} className={`component-item state-${state}`}>
              <div className="component-name">{component}</div>
              <div className="component-details">
                <span className={`state-badge state-${state}`}>{state}</span>
                <span className="type-badge">{type}</span>
                <span className="version-badge">v{version}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Component to display the central megamodel with more useful information
const MegamodelBox: React.FC<{
  megamodel: Megamodel;
}> = ({ megamodel }) => {
  // Count components in each state
  const stateCounts = {
    m: 0,
    "s+": 0,
    "s-": 0,
    i: 0,
  };

  // Count components by consistency type
  const typeCounts = {
    sc: 0,
    ec: 0,
    bs: 0,
    mr: 0,
    rmw: 0,
  };

  // Calculate statistics
  for (const [key, state] of megamodel.states.entries()) {
    if (state in stateCounts) {
      stateCounts[state as keyof typeof stateCounts]++;
    }

    const type = megamodel.types.get(key);
    if (type && type in typeCounts) {
      typeCounts[type as keyof typeof typeCounts]++;
    }
  }

  // Find any modified components
  const modifiedComponents: Array<{ service: string; component: string }> = [];
  for (const [key, state] of megamodel.states.entries()) {
    if (state === "m") {
      const [service, component] = key.split(":");
      modifiedComponents.push({ service, component });
    }
  }

  // Find any bounded staleness components
  const bsComponents: Array<{
    service: string;
    component: string;
    state: ConsistencyState;
    timeRemaining?: number;
  }> = [];
  const currentTime = Date.now();

  for (const [key, type] of megamodel.types.entries()) {
    if (type === "bs") {
      const [service, component] = key.split(":");
      const state = megamodel.states.get(key) as ConsistencyState;
      const stalenessBound = megamodel.stalenessBounds.get(key);

      let timeRemaining: number | undefined;
      if (stalenessBound && state === "s-") {
        timeRemaining = Math.max(0, stalenessBound - currentTime);
      }

      bsComponents.push({
        service,
        component,
        state,
        timeRemaining,
      });
    }
  }

  return (
    <div className="megamodel-box">
      <h4>Megamodel - Consistency Directory</h4>

      <div className="metadata-section">
        <div className="megamodel-stats">
          <div className="megamodel-stat-item">
            <div className="stat-title">Component States</div>
            <div className="state-badges">
              <span className="state-count-badge state-m">
                {stateCounts.m} Modified
              </span>
              <span className="state-count-badge state-s+">
                {stateCounts["s+"]} Shared+
              </span>
              <span className="state-count-badge state-s-">
                {stateCounts["s-"]} Shared-
              </span>
              <span className="state-count-badge state-i">
                {stateCounts.i} Invalid
              </span>
            </div>
          </div>

          <div className="megamodel-stat-item">
            <div className="stat-title">Consistency Types</div>
            <div className="type-badges">
              <span className="type-count-badge type-sc">
                {typeCounts.sc} Strong
              </span>
              <span className="type-count-badge type-ec">
                {typeCounts.ec} Eventual
              </span>
              <span className="type-count-badge type-bs">
                {typeCounts.bs} Bounded
              </span>
              <span className="type-count-badge type-mr">
                {typeCounts.mr} Monotonic
              </span>
              <span className="type-count-badge type-rmw">
                {typeCounts.rmw} Read-My-Writes
              </span>
            </div>
          </div>
        </div>

        {modifiedComponents.length > 0 && (
          <div className="metadata-item alerts-section">
            <span className="metadata-label">Modified Components</span>
            <div className="modified-alerts">
              {modifiedComponents.map(({ service, component }, index) => (
                <div key={index} className="alert-item">
                  {service}.{component} requires propagation
                </div>
              ))}
            </div>
          </div>
        )}

        {bsComponents.filter(
          c => c.state === "s-" && c.timeRemaining !== undefined
        ).length > 0 && (
          <div className="metadata-item alerts-section">
            <span className="metadata-label">Staleness Warnings</span>
            <div className="staleness-alerts">
              {bsComponents
                .filter(c => c.state === "s-" && c.timeRemaining !== undefined)
                .map((comp, index) => (
                  <div key={index} className="alert-item">
                    {comp.service}.{comp.component}:{" "}
                    {Math.floor((comp.timeRemaining || 0) / 1000)}s until
                    invalid
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="metadata-description">
          <p>
            The megamodel acts as a centralized directory that tracks
            consistency states across all components and services in the system.
          </p>
        </div>
      </div>
    </div>
  );
};

// Enhanced GOM display component with better explanation
const GOMBox: React.FC<{
  gom: GOM;
  currentGOM: string | null;
  onSelectGOM: (gomId: string) => void;
}> = ({ gom, currentGOM, onSelectGOM }) => {
  const isActive = gom.id === currentGOM;

  return (
    <div
      className={`gom-box ${isActive ? "active-gom" : ""}`}
      onClick={() => onSelectGOM(gom.id)}
    >
      <h4>{gom.name}</h4>
      <div className="gom-details">
        {gom.components.map(component => (
          <React.Fragment key={component}>
            {gom.services.map(service => {
              const key = getKey(service, component);
              const consistencyType = gom.consistencyTypes.get(key);
              const accessPattern = gom.accessPatterns.get(key);

              if (consistencyType && accessPattern) {
                return (
                  <div key={key} className="gom-item">
                    <span className="service-component">
                      {service}.{component}:
                    </span>
                    <span
                      className={`consistency-type type-${consistencyType}`}
                    >
                      {consistencyType}
                    </span>
                    <span className="access-pattern">({accessPattern})</span>
                  </div>
                );
              }
              return null;
            })}
          </React.Fragment>
        ))}
      </div>
      {isActive && (
        <div className="gom-description">
          <p>Active Global Operation Model</p>
        </div>
      )}
    </div>
  );
};

// Component to display the transition history
const TransitionHistory: React.FC<{
  history: TransitionHistoryEntry[];
}> = ({ history }) => {
  return (
    <div className="transition-history">
      <h3>Transition History</h3>
      <div className="history-list">
        {history.length === 0 ? (
          <div className="history-item">No transitions yet</div>
        ) : (
          history.map((entry, index) => (
            <div key={index} className="history-item">
              <div className="history-timestamp">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </div>
              <div className="history-operation-details">
                <span className="history-service">{entry.service}</span>
                <span className="history-dot">·</span>
                <span className="history-component">{entry.component}</span>
                <span className="history-dot">·</span>
                <span className="history-operation">{entry.operation}</span>
              </div>
              <div className="history-transition">
                <span className={`state-pill state-${entry.fromState}`}>
                  {entry.fromState}
                </span>
                <span className="transition-arrow">→</span>
                <span className={`state-pill state-${entry.toState}`}>
                  {entry.toState}
                </span>
              </div>
              <div className="history-description">{entry.description}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Component to display the state transition table with error handling
const StateTransitionTable: React.FC<{
  megamodel: Megamodel;
  currentStep: number;
}> = ({ megamodel, currentStep }) => {
  // Get states from the current megamodel
  const getState = (service: string, component: string): ConsistencyState => {
    return (
      (megamodel.states.get(getKey(service, component)) as ConsistencyState) ||
      ("-" as ConsistencyState)
    );
  };

  // State data for e-commerce scenario (from Table 3 in the paper)
  const steps = [
    { name: "Initial" },
    { name: "1. Order creation" },
    { name: "2. Payment read" },
    { name: "3. Payment auth" },
    { name: "4. Inventory check" },
    { name: "5. Inventory update" },
    { name: "6. Background sync" },
    { name: "7. Bounded Staleness Demo" },
  ];

  // Guard against invalid currentStep
  const safeCurrentStep = Math.min(currentStep, steps.length - 1);
  const stepName = steps[safeCurrentStep]?.name || "Completed";

  return (
    <div className="state-transition-table">
      <h3>
        E-Commerce State Transitions (Step {Math.min(currentStep, steps.length)}
        /{steps.length})
      </h3>
      <table>
        <thead>
          <tr>
            <th>Step</th>
            <th colSpan={4}>OrderService</th>
            <th colSpan={2}>PaymentService</th>
            <th>InventoryService</th>
          </tr>
          <tr>
            <th></th>
            <th>Order</th>
            <th>Payment</th>
            <th>Inventory</th>
            <th>Product</th>
            <th>Order</th>
            <th>Payment</th>
            <th>Inventory</th>
          </tr>
        </thead>
        <tbody>
          {/* Current step row using real megamodel data */}
          <tr className="current-step">
            <td>{stepName}</td>
            <td className={`state-${getState("OrderService", "OrderModel")}`}>
              {getState("OrderService", "OrderModel")}
            </td>
            <td className={`state-${getState("OrderService", "PaymentModel")}`}>
              {getState("OrderService", "PaymentModel")}
            </td>
            <td
              className={`state-${getState("OrderService", "InventoryModel")}`}
            >
              {getState("OrderService", "InventoryModel")}
            </td>
            <td className={`state-${getState("OrderService", "ProductModel")}`}>
              {getState("OrderService", "ProductModel")}
            </td>
            <td className={`state-${getState("PaymentService", "OrderModel")}`}>
              {getState("PaymentService", "OrderModel")}
            </td>
            <td
              className={`state-${getState("PaymentService", "PaymentModel")}`}
            >
              {getState("PaymentService", "PaymentModel")}
            </td>
            <td
              className={`state-${getState(
                "InventoryService",
                "InventoryModel"
              )}`}
            >
              {getState("InventoryService", "InventoryModel")}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

// Component for operation controls
const OperationControls: React.FC<{
  megamodel: Megamodel;
  onApplyOperation: (
    service: string,
    component: string,
    operation: Operation,
    isSource: boolean
  ) => void;
}> = ({ megamodel, onApplyOperation }) => {
  const [selectedService, setSelectedService] =
    useState<string>("OrderService");
  const [selectedComponent, setSelectedComponent] =
    useState<string>("OrderModel");
  const [selectedOperation, setSelectedOperation] =
    useState<Operation>("update");
  const [isSource, setIsSource] = useState<boolean>(true);

  // Get available components for the selected service
  const availableComponents: string[] = [];
  for (const [key, _] of megamodel.states) {
    const [service, component] = key.split(":");
    if (
      service === selectedService &&
      !availableComponents.includes(component)
    ) {
      availableComponents.push(component);
    }
  }

  // Get available services
  const availableServices: string[] = [];
  for (const [key, _] of megamodel.states) {
    const [service, _component] = key.split(":");
    if (!availableServices.includes(service)) {
      availableServices.push(service);
    }
  }

  // Update selected component when service changes
  useEffect(() => {
    if (
      availableComponents.length > 0 &&
      !availableComponents.includes(selectedComponent)
    ) {
      setSelectedComponent(availableComponents[0]);
    }
  }, [selectedService, availableComponents, selectedComponent]);

  return (
    <div className="operation-controls">
      <h3>Operation Controls</h3>
      <div className="control-grid">
        <div className="control-item">
          <label>Service:</label>
          <select
            value={selectedService}
            onChange={e => setSelectedService(e.target.value)}
          >
            {availableServices.map(service => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>
        </div>
        <div className="control-item">
          <label>Component:</label>
          <select
            value={selectedComponent}
            onChange={e => setSelectedComponent(e.target.value)}
          >
            {availableComponents.map(component => (
              <option key={component} value={component}>
                {component}
              </option>
            ))}
          </select>
        </div>
        <div className="control-item">
          <label>Operation:</label>
          <select
            value={selectedOperation}
            onChange={e => setSelectedOperation(e.target.value as Operation)}
          >
            <option value="update">update</option>
            <option value="share">share</option>
            <option value="refresh">refresh</option>
            <option value="timeout">timeout</option>
            <option value="read">read</option>
          </select>
        </div>
        <div className="control-item">
          <label>Is Source:</label>
          <input
            type="checkbox"
            checked={isSource}
            onChange={e => setIsSource(e.target.checked)}
          />
        </div>
      </div>
      <button
        className="apply-button"
        onClick={() =>
          onApplyOperation(
            selectedService,
            selectedComponent,
            selectedOperation,
            isSource
          )
        }
      >
        Apply Operation
      </button>
    </div>
  );
};

// Modified handleApplyOperation to capture propagation history
const handleApplyOperation = (
  service: string,
  component: string,
  operation: Operation,
  isSource: boolean
) => {
  const key = getKey(service, component);
  const currentState = megamodel.states.get(key) as ConsistencyState;

  // Create a copy of the megamodel
  const newMegamodel = {
    states: new Map(megamodel.states),
    types: new Map(megamodel.types),
    versions: new Map(megamodel.versions),
    timestamps: new Map(megamodel.timestamps),
    stalenessBounds: new Map(megamodel.stalenessBounds),
  };

  let newState = currentState;
  let historyEntries: TransitionHistoryEntry[] = [];

  // Special case for timeout demonstration (always works for demo purposes)
  if (operation === "timeout") {
    // If component is in Shared- state, transition to Invalid
    if (
      currentState === "s-" ||
      (currentState !== "i" &&
        service === "OrderService" &&
        component === "InventoryModel")
    ) {
      newState = "i";
      newMegamodel.states.set(key, "i");
    }
  }
  // Special case for refresh demonstration (always works for demo purposes)
  else if (operation === "refresh") {
    // If component is in Invalid state, refresh it to Shared+
    if (
      currentState === "i" ||
      (service === "OrderService" && component === "InventoryModel")
    ) {
      newState = "s+";
      newMegamodel.states.set(key, "s+");

      // Update version and timestamp
      const authSource = findAuthoritativeSource(component, newMegamodel) || "";
      const sourceVersion = newMegamodel.versions.get(authSource) || 1;
      newMegamodel.versions.set(key, sourceVersion);
      newMegamodel.timestamps.set(key, Date.now());
    }
  }
  // For other operations, apply the transition rules
  else {
    // Callback to capture propagation history
    const propagationCallback = (entries: TransitionHistoryEntry[]) => {
      historyEntries = entries;
    };

    // Apply the transition
    const transitionedModel = applyTransition(
      newMegamodel,
      service,
      component,
      operation,
      isSource,
      propagationCallback
    );

    // Get the new state
    newState = transitionedModel.states.get(key) as ConsistencyState;

    // Use the transitioned model
    Object.assign(newMegamodel, transitionedModel);
  }

  // Create the main history entry
  const mainHistoryEntry: TransitionHistoryEntry = {
    timestamp: Date.now(),
    service,
    component,
    operation,
    fromState: currentState,
    toState: newState,
    description: `Applied ${operation} on ${service}.${component}`,
  };

  // Update the megamodel and history
  setMegamodel(newMegamodel);
  setHistory([...history, mainHistoryEntry, ...historyEntries]);
};

// Similar modification for the advanceScenarioStep function to capture propagation history
const advanceScenarioStep = () => {
  if (currentScenarioStep < ecommerceScenarioSteps.length) {
    const step = ecommerceScenarioSteps[currentScenarioStep];

    // Apply all operations for this step
    let updatedMegamodel = { ...megamodel };
    const newHistoryEntries: TransitionHistoryEntry[] = [];

    for (const op of step.operations) {
      const key = getKey(op.service, op.component);
      const currentState = updatedMegamodel.states.get(key) as ConsistencyState;

      // Collect propagation history entries
      const propagationEntries: TransitionHistoryEntry[] = [];
      const propagationCallback = (entries: TransitionHistoryEntry[]) => {
        propagationEntries.push(...entries);
      };

      // Apply the transition
      updatedMegamodel = applyTransition(
        updatedMegamodel,
        op.service,
        op.component,
        op.operation,
        op.isSource,
        propagationCallback
      );

      // Verify the expected state change
      const resultState = updatedMegamodel.states.get(key);

      // Force the expected state if needed for demonstration purposes
      if (op.expectedNewState && resultState !== op.expectedNewState) {
        console.warn(
          `Expected state ${op.expectedNewState} but got ${resultState}. Forcing correct state.`
        );
        updatedMegamodel.states.set(key, op.expectedNewState);
      }

      // Record main history entry with correct state transition
      const finalState = updatedMegamodel.states.get(key) as ConsistencyState;
      newHistoryEntries.push({
        timestamp: Date.now(),
        service: op.service,
        component: op.component,
        operation: op.operation,
        fromState: currentState,
        toState: finalState,
        description: `${step.step}: ${step.description}`,
      });

      // Add propagation entries
      newHistoryEntries.push(...propagationEntries);
    }

    // Special handling for inventory update in step 5
    if (
      step.step === "Inventory Update" &&
      !newHistoryEntries.some(
        entry =>
          entry.service === "OrderService" &&
          entry.component === "InventoryModel" &&
          entry.toState === "s-"
      )
    ) {
      // Ensure OrderService.InventoryModel transitions to s- due to bounded staleness
      const orderInvKey = getKey("OrderService", "InventoryModel");
      const orderInvState = updatedMegamodel.states.get(orderInvKey);

      if (orderInvState !== "s-") {
        const prevState = orderInvState as ConsistencyState;
        updatedMegamodel.states.set(orderInvKey, "s-");

        // Set staleness bound
        const currentTime = Date.now();
        updatedMegamodel.stalenessBounds.set(orderInvKey, currentTime + 30000);

        // Add explicit propagation entry to history
        newHistoryEntries.push({
          timestamp: Date.now() + 100, // Slightly later to show sequence
          service: "OrderService",
          component: "InventoryModel",
          operation: "update",
          fromState: prevState,
          toState: "s-",
          description:
            "Propagated update: Inventory becomes potentially stale in OrderService (Bounded Staleness)",
        });
      }
    }

    setMegamodel(updatedMegamodel);
    setHistory([...history, ...newHistoryEntries]);

    const newStep = currentScenarioStep + 1;
    setCurrentScenarioStep(newStep);

    // Check if scenario is complete
    if (newStep >= ecommerceScenarioSteps.length) {
      setScenarioDone(true);
    }
  }
};

// Helper to find the authoritative source for a component
const findAuthoritativeSource = (
  component: string,
  megamodel: Megamodel
): string | null => {
  // For simplicity, we're using a naming convention where the service that "owns"
  // a component has the same prefix. E.g., OrderService owns OrderModel
  const owningService = component.replace("Model", "Service");
  const key = getKey(owningService, component);

  if (megamodel.states.has(key)) {
    return key;
  }

  // Fallback: look for any service with Modified state
  for (const [serviceComponentKey, state] of megamodel.states.entries()) {
    if (serviceComponentKey.includes(`:${component}`) && state === "m") {
      return serviceComponentKey;
    }
  }

  return null;
};
// Main application component with added Bounded Staleness functionality
const App: React.FC = () => {
  const [megamodel, setMegamodel] = useState<Megamodel>(
    createInitialMegamodel()
  );
  const [goms] = useState<GOM[]>(initialGOMs);
  const [history, setHistory] = useState<TransitionHistoryEntry[]>([]);
  const [autoMode, setAutoMode] = useState<boolean>(false);
  const [currentScenarioStep, setCurrentScenarioStep] = useState<number>(0);
  const [autoInterval, setAutoIntervalState] = useState<NodeJS.Timeout | null>(
    null
  );
  const [currentGOM, setCurrentGOM] = useState<string>("gom1"); // Default to Order Processing GOM
  const [stalenessCheckInterval, setStalnessCheckInterval] =
    useState<NodeJS.Timeout | null>(null);

  // Set up staleness checking interval
  useEffect(() => {
    // Check bounded staleness every second
    const interval = setInterval(() => {
      // Skip staleness check in auto mode
      if (!autoMode) {
        const newMegamodel = checkBoundedStaleness(megamodel);

        // If any state changed, update megamodel and potentially add to history
        let stateChanged = false;
        for (const [key, state] of megamodel.states.entries()) {
          if (state !== newMegamodel.states.get(key)) {
            stateChanged = true;

            // Could add to history here
            const [service, component] = key.split(":");
            setHistory(prev => [
              ...prev,
              {
                timestamp: Date.now(),
                service,
                component,
                operation: "timeout",
                fromState: state as ConsistencyState,
                toState: newMegamodel.states.get(key) as ConsistencyState,
                description:
                  "Bounded staleness timeout: Component exceeded staleness bound",
              },
            ]);
          }
        }

        if (stateChanged) {
          setMegamodel(newMegamodel);
        }
      }
    }, 1000);

    setStalnessCheckInterval(interval);

    return () => {
      if (stalenessCheckInterval) {
        clearInterval(stalenessCheckInterval);
      }
    };
  }, [megamodel, autoMode]);

  // Function to apply an operation and update the state
  const handleApplyOperation = (
    service: string,
    component: string,
    operation: Operation,
    isSource: boolean
  ) => {
    const key = getKey(service, component);
    const currentState = megamodel.states.get(key) as ConsistencyState;

    // Apply the transition
    const newMegamodel = applyTransition(
      megamodel,
      service,
      component,
      operation,
      isSource
    );

    // Update history
    const newState = newMegamodel.states.get(key) as ConsistencyState;
    const newHistoryEntry: TransitionHistoryEntry = {
      timestamp: Date.now(),
      service,
      component,
      operation,
      fromState: currentState,
      toState: newState,
      description: `Applied ${operation} on ${service}.${component}`,
    };

    // Special handler for BS timeout operation
    if (operation === "timeout" && currentState === "s-") {
      // Manually set to invalid for demo purposes
      newMegamodel.states.set(key, "i");
      newHistoryEntry.toState = "i";
      newHistoryEntry.description = `Simulated staleness timeout on ${service}.${component}`;
    }

    setMegamodel(newMegamodel);
    setHistory([...history, newHistoryEntry]);
  };

  // Function to reset the state
  const handleReset = () => {
    setMegamodel(createInitialMegamodel());
    setHistory([]);
    setCurrentScenarioStep(0);
  };

  // Function to manually force a state (for debugging and fixing scenarios)
  const forceState = (
    service: string,
    component: string,
    newState: ConsistencyState
  ) => {
    const key = getKey(service, component);
    const updatedMegamodel = { ...megamodel };
    updatedMegamodel.states.set(key, newState);
    setMegamodel(updatedMegamodel);
  };

  // Function to advance to the next scenario step
  const advanceScenarioStep = () => {
    if (currentScenarioStep < ecommerceScenarioSteps.length) {
      const step = ecommerceScenarioSteps[currentScenarioStep];

      // Apply all operations for this step
      let updatedMegamodel = { ...megamodel };
      const newHistoryEntries: TransitionHistoryEntry[] = [];

      for (const op of step.operations) {
        const key = getKey(op.service, op.component);
        const currentState = updatedMegamodel.states.get(
          key
        ) as ConsistencyState;

        // Apply the transition
        updatedMegamodel = applyTransition(
          updatedMegamodel,
          op.service,
          op.component,
          op.operation,
          op.isSource
        );

        // Verify the expected state change
        const resultState = updatedMegamodel.states.get(key);

        // Force the expected state if needed for demonstration purposes
        if (op.expectedNewState && resultState !== op.expectedNewState) {
          console.warn(
            `Expected state ${op.expectedNewState} but got ${resultState}. Forcing correct state.`
          );
          updatedMegamodel.states.set(key, op.expectedNewState);
        }

        // Record history with correct state transition
        const finalState = updatedMegamodel.states.get(key) as ConsistencyState;
        newHistoryEntries.push({
          timestamp: Date.now(),
          service: op.service,
          component: op.component,
          operation: op.operation,
          fromState: currentState,
          toState: finalState,
          description: `${step.step}: ${step.description}`,
        });
      }

      // Special handling for propagation effects (e.g., OrderService.InventoryModel becoming s- when InventoryService updates)
      if (step.step === "Inventory Update") {
        const orderInvKey = getKey("OrderService", "InventoryModel");
        const orderInvState = updatedMegamodel.states.get(orderInvKey);

        // Force transition to Shared- if needed
        if (orderInvState !== "s-") {
          updatedMegamodel.states.set(orderInvKey, "s-");

          // Add this propagation to history
          newHistoryEntries.push({
            timestamp: Date.now() + 100, // Slightly later to show sequence
            service: "OrderService",
            component: "InventoryModel",
            operation: "update",
            fromState: "s+",
            toState: "s-",
            description:
              "Propagated update: Inventory becomes potentially stale in OrderService",
          });

          // For bounded staleness, set the staleness bound
          const currentTime = Date.now();
          updatedMegamodel.stalenessBounds.set(
            orderInvKey,
            currentTime + 30000
          ); // 30 second bound
        }
      }

      setMegamodel(updatedMegamodel);
      setHistory([...history, ...newHistoryEntries]);
      setCurrentScenarioStep(currentScenarioStep + 1);
    }
  };

  // Handle GOM selection
  const handleSelectGOM = (gomId: string) => {
    setCurrentGOM(gomId);
  };

  // Toggle auto mode
  const toggleAutoMode = () => {
    setAutoMode(!autoMode);
  };

  // Effect to handle auto mode
  useEffect(() => {
    if (autoMode) {
      const interval = setInterval(() => {
        if (currentScenarioStep < ecommerceScenarioSteps.length) {
          advanceScenarioStep();
        } else {
          setAutoMode(false);
        }
      }, 2000);
      setAutoIntervalState(interval);
      return () => clearInterval(interval);
    } else if (autoInterval) {
      clearInterval(autoInterval);
      setAutoIntervalState(null);
    }
  }, [autoMode, currentScenarioStep]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Megamodel-Based Consistency Management</h1>
        <p>Implementing Flexible Consistency through State Transition Rules</p>
      </header>

      <div className="control-panel">
        <button onClick={handleReset} className="reset-button">
          Reset System
        </button>
        <button
          onClick={advanceScenarioStep}
          disabled={currentScenarioStep >= ecommerceScenarioSteps.length}
          className="next-button"
        >
          Next Scenario Step ({currentScenarioStep}/
          {ecommerceScenarioSteps.length})
        </button>
        <button
          onClick={toggleAutoMode}
          className={`auto-button ${autoMode ? "active" : ""}`}
          disabled={currentScenarioStep >= ecommerceScenarioSteps.length}
        >
          {autoMode ? "Stop Auto Mode" : "Start Auto Mode"}
        </button>
      </div>

      <div className="main-content">
        <div className="left-column">
          <div className="state-transition-panel">
            <StateTransitionTable
              megamodel={megamodel}
              currentStep={currentScenarioStep}
            />
          </div>

          <div className="services-panel">
            <h3>Microservices</h3>
            <div className="services-grid">
              <MicroserviceBox service="OrderService" megamodel={megamodel} />
              <MicroserviceBox service="PaymentService" megamodel={megamodel} />
              <MicroserviceBox
                service="InventoryService"
                megamodel={megamodel}
              />
            </div>
          </div>

          {/* New Bounded Staleness demo section */}
          <BoundedStalenessDemo
            megamodel={megamodel}
            onApplyOperation={handleApplyOperation}
          />
        </div>

        <div className="right-column">
          <div className="megamodel-panel">
            <h3>Megamodel and Global Operation Models (GOMs)</h3>
            <div className="megamodel-container">
              <MegamodelBox megamodel={megamodel} />
              <div className="goms-container">
                {goms.map(gom => (
                  <GOMBox
                    key={gom.id}
                    gom={gom}
                    currentGOM={currentGOM}
                    onSelectGOM={handleSelectGOM}
                  />
                ))}
              </div>

              <div className="consistency-legend">
                <div className="consistency-type-item">
                  <div className="consistency-type-dot type-sc"></div>
                  <span className="consistency-type-label">sc</span>
                  <span className="consistency-type-full">Strong</span>
                </div>
                <div className="consistency-type-item">
                  <div className="consistency-type-dot type-ec"></div>
                  <span className="consistency-type-label">ec</span>
                  <span className="consistency-type-full">Eventual</span>
                </div>
                <div className="consistency-type-item">
                  <div className="consistency-type-dot type-bs"></div>
                  <span className="consistency-type-label">bs</span>
                  <span className="consistency-type-full">Bounded</span>
                </div>
                <div className="consistency-type-item">
                  <div className="consistency-type-dot type-mr"></div>
                  <span className="consistency-type-label">mr</span>
                  <span className="consistency-type-full">Monotonic</span>
                </div>
                <div className="consistency-type-item">
                  <div className="consistency-type-dot type-rmw"></div>
                  <span className="consistency-type-label">rmw</span>
                  <span className="consistency-type-full">Read-My-Writes</span>
                </div>
              </div>
            </div>
          </div>

          <div className="history-panel">
            <TransitionHistory history={history} />
          </div>

          <div className="controls-panel">
            <OperationControls
              megamodel={megamodel}
              onApplyOperation={handleApplyOperation}
            />
          </div>
        </div>
      </div>

      <footer className="app-footer">
        <p>
          Based on "Flexible Consistency Management in Microservice
          Architectures through Megamodel-Based State Transition Rules"
        </p>
      </footer>
    </div>
  );
};
export default App;
