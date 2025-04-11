import React, { useState, useEffect } from "react";
import { ArrowRight, RefreshCw, Check, X } from "lucide-react";
import "./App.css";

// Define the types for our state transition system
type StateValue = string;
type StateName = string;
type State = Record<StateName, StateValue>;
type TransitionRule = {
  name: string;
  precondition: (state: State) => boolean;
  effect: (state: State) => State;
};

// Initial state of our system
const initialState: State = {
  clientView: "initial",
  serverData: "initial",
  processingStatus: "idle",
  consistency: "consistent",
};

// Define transition rules based on the paper
const transitionRules: TransitionRule[] = [
  {
    name: "ClientRequest",
    precondition: state => state.processingStatus === "idle",
    effect: state => ({
      ...state,
      clientView: "pending",
      processingStatus: "processing",
      consistency: "temporary_inconsistent",
    }),
  },
  {
    name: "ServerProcess",
    precondition: state => state.processingStatus === "processing",
    effect: state => ({
      ...state,
      serverData: "updated",
      processingStatus: "completed",
    }),
  },
  {
    name: "ClientSync",
    precondition: state => state.processingStatus === "completed",
    effect: state => ({
      ...state,
      clientView: "updated",
      processingStatus: "idle",
      consistency: "consistent",
    }),
  },
  {
    name: "Rollback",
    precondition: state => state.consistency === "temporary_inconsistent",
    effect: state => ({
      ...state,
      clientView: "initial",
      serverData: "initial",
      processingStatus: "idle",
      consistency: "consistent",
    }),
  },
];

// Function to check if a rule can be applied
const canApplyRule = (rule: TransitionRule, state: State): boolean => {
  return rule.precondition(state);
};

// Function to apply a rule to a state
const applyRule = (rule: TransitionRule, state: State): State => {
  if (!canApplyRule(rule, state)) {
    return state;
  }
  return rule.effect(state);
};

// Component to display the current state
const StateDisplay: React.FC<{ state: State }> = ({ state }) => {
  return (
    <div className="state-display">
      <h3>Current System State</h3>
      <div className="state-grid">
        {Object.entries(state).map(([key, value]) => (
          <div key={key} className="state-item">
            <div className="state-name">{key}</div>
            <div
              className={`state-value ${
                value === "consistent"
                  ? "consistent"
                  : value === "temporary_inconsistent"
                  ? "inconsistent"
                  : ""
              }`}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Component to display available transitions
const TransitionControls: React.FC<{
  state: State;
  rules: TransitionRule[];
  onApplyRule: (rule: TransitionRule) => void;
}> = ({ state, rules, onApplyRule }) => {
  return (
    <div className="transition-controls">
      <h3>Available Transitions</h3>
      <div className="transition-buttons">
        {rules.map(rule => (
          <button
            key={rule.name}
            onClick={() => onApplyRule(rule)}
            disabled={!canApplyRule(rule, state)}
            className={canApplyRule(rule, state) ? "enabled" : "disabled"}
          >
            {rule.name}
          </button>
        ))}
      </div>
    </div>
  );
};

// Component to visualize the system state
const SystemVisualization: React.FC<{ state: State }> = ({ state }) => {
  return (
    <div className="system-visualization">
      <h3>System Visualization</h3>
      <div className="visualization-container">
        <div
          className={`client-box ${
            state.clientView === "pending" ? "pending" : ""
          }`}
        >
          <h4>Client</h4>
          <div className="view-data">
            <span>View: </span>
            <span className={`value ${state.clientView}`}>
              {state.clientView}
            </span>
          </div>
        </div>

        <div className="connection">
          {state.processingStatus === "processing" && (
            <div className="processing-indicator">
              <RefreshCw size={20} className="spin" />
            </div>
          )}
          {state.processingStatus === "completed" && (
            <div className="completed-indicator">
              <ArrowRight size={20} />
            </div>
          )}
          <div className="consistency-indicator">
            {state.consistency === "consistent" ? (
              <Check size={20} className="consistent-icon" />
            ) : (
              <X size={20} className="inconsistent-icon" />
            )}
          </div>
        </div>

        <div className="server-box">
          <h4>Server</h4>
          <div className="server-data">
            <span>Data: </span>
            <span className={`value ${state.serverData}`}>
              {state.serverData}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Component to display the transition history
const TransitionHistory: React.FC<{ history: string[] }> = ({ history }) => {
  return (
    <div className="transition-history">
      <h3>Transition History</h3>
      <div className="history-list">
        {history.length === 0 ? (
          <div className="history-item">No transitions yet</div>
        ) : (
          history.map((transition, index) => (
            <div key={index} className="history-item">
              {index + 1}. {transition}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Main application component
const App: React.FC = () => {
  const [currentState, setCurrentState] = useState<State>(initialState);
  const [history, setHistory] = useState<string[]>([]);
  const [autoMode, setAutoMode] = useState<boolean>(false);
  const [autoInterval, setAutoIntervalState] = useState<NodeJS.Timeout | null>(
    null
  );

  // Function to apply a rule and update the state
  const handleApplyRule = (rule: TransitionRule) => {
    if (canApplyRule(rule, currentState)) {
      const newState = applyRule(rule, currentState);
      setCurrentState(newState);
      setHistory([...history, `Applied ${rule.name}`]);
    }
  };

  // Function to reset the state
  const handleReset = () => {
    setCurrentState(initialState);
    setHistory([]);
  };

  // Function to toggle auto mode
  const toggleAutoMode = () => {
    setAutoMode(!autoMode);
  };

  // Effect to handle auto mode
  useEffect(() => {
    if (autoMode) {
      const interval = setInterval(() => {
        // Find the first applicable rule
        const applicableRule = transitionRules.find(rule =>
          canApplyRule(rule, currentState)
        );
        if (applicableRule) {
          handleApplyRule(applicableRule);
        } else {
          // If no rules can be applied, stop auto mode
          setAutoMode(false);
        }
      }, 1500);
      setAutoIntervalState(interval);
      return () => clearInterval(interval);
    } else if (autoInterval) {
      clearInterval(autoInterval);
      setAutoIntervalState(null);
    }
  }, [autoMode, currentState]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Microservice State Transition Simulator</h1>
        <p>Based on Megamodel-Based State Transition Rules</p>
      </header>

      <div className="control-panel">
        <button onClick={handleReset} className="reset-button">
          Reset System
        </button>
        <button
          onClick={toggleAutoMode}
          className={`auto-button ${autoMode ? "active" : ""}`}
        >
          {autoMode ? "Stop Auto Mode" : "Start Auto Mode"}
        </button>
      </div>

      <div className="main-content">
        <div className="left-panel">
          <StateDisplay state={currentState} />
          <TransitionControls
            state={currentState}
            rules={transitionRules}
            onApplyRule={handleApplyRule}
          />
        </div>
        <div className="right-panel">
          <SystemVisualization state={currentState} />
          <TransitionHistory history={history} />
        </div>
      </div>

      <footer className="app-footer">
        <p>Flexible Consistency Management in Microservice Architectures</p>
      </footer>
    </div>
  );
};

export default App;
