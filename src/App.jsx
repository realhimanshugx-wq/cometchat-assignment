import { useEffect, useRef, useState } from "react";
import { CometChat } from "@cometchat/chat-sdk-javascript";
import "./App.css";

const APP_ID = "1679256584459f8a7";
const REGION = "IN";
const AUTH_KEY = "a65169f24e035da3c2a5199c2a15dd9c0eee67d9";
const REST_API_KEY = "6f3e8ff67175097d81cd87beac48c6c6eb5029ce";

const API_BASE = `https://${APP_ID}.api-${REGION.toLowerCase()}.cometchat.io/v3`;

function App() {
  const initializedRef = useRef(false);

  const [users, setUsers] = useState([]);
  const [loginUid, setLoginUid] = useState("");
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("Loading users...");
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/users?perPage=100&page=1`, {
        headers: {
          apikey: REST_API_KEY,
          accept: "application/json",
        },
      });

      const data = await res.json();
      const fetchedUsers = data?.data || [];

      setUsers(fetchedUsers);

      if (!loginUid && fetchedUsers.length > 0) {
        setLoginUid(fetchedUsers[0].uid);
      }

      setStatus("Users loaded successfully");
    } catch (err) {
      setStatus("Fetch users error: " + err.message);
    }
  };

  const initCometChat = async () => {
    if (initializedRef.current) return;

    const appSettings = new CometChat.AppSettingsBuilder()
      .setRegion(REGION)
      .subscribePresenceForAllUsers()
      .autoEstablishSocketConnection(true)
      .build();

    await CometChat.init(APP_ID, appSettings);
    initializedRef.current = true;
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const loginSelectedUser = async () => {
    try {
      setLoading(true);
      setStatus("Initializing CometChat...");

      await initCometChat();

      const oldUser = await CometChat.getLoggedinUser();
      if (oldUser) await CometChat.logout();

      const user = await CometChat.login(loginUid, AUTH_KEY);

      setLoggedInUser(user);

      const matchedUser =
        users.find((u) => u.uid === user.uid) || {
          uid: user.uid,
          name: user.name,
          status: "online",
        };

      setSelectedContact(matchedUser);
      setMessages([]);
      setStatus(`${user.name || user.uid} is online`);
    } catch (err) {
      setStatus("Login error: " + (err?.message || JSON.stringify(err)));
    } finally {
      setLoading(false);
    }
  };

  const logoutUser = async () => {
    try {
      await CometChat.logout();
    } catch {}

    setLoggedInUser(null);
    setSelectedContact(null);
    setMessages([]);
    setStatus("Logged out");
    fetchUsers();
  };

  const sendMessage = async () => {
    if (!selectedContact || !text.trim()) return;

    if (selectedContact.uid === loggedInUser.uid) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), text, side: "right" },
      ]);
      setText("");
      return;
    }

    try {
      const msg = new CometChat.TextMessage(
        selectedContact.uid,
        text,
        CometChat.RECEIVER_TYPE.USER
      );

      await CometChat.sendMessage(msg);

      setMessages((prev) => [
        ...prev,
        { id: Date.now(), text, side: "right" },
      ]);

      setText("");
    } catch (err) {
      alert("Message failed: " + (err?.message || JSON.stringify(err)));
    }
  };

  if (!loggedInUser) {
    return (
      <div className="app">
        <div className="loginCard">
          <span className="badge">Real CometChat Login</span>
          <h1>Select User</h1>
          <p>Users are fetched directly from CometChat dashboard.</p>

          <select value={loginUid} onChange={(e) => setLoginUid(e.target.value)}>
            {users.map((user) => (
              <option key={user.uid} value={user.uid}>
                {(user.name || user.uid) + " - " + user.uid}
              </option>
            ))}
          </select>

          <div className="btnRow">
            <button onClick={loginSelectedUser} disabled={loading}>
              {loading ? "Logging in..." : "Login & Go Online"}
            </button>

            <button className="secondaryBtn" onClick={fetchUsers}>
              Refresh Users
            </button>
          </div>

          <div className="status">{status}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="chatLayout">
        <aside className="sidebar">
          <h2>CometChat</h2>

          <div className="profile">
            <span className="dot online"></span>
            <div className="avatar">
              {(loggedInUser.name || loggedInUser.uid).charAt(0)}
            </div>
            <div>
              <strong>{loggedInUser.name || loggedInUser.uid}</strong>
              <p>Online • {loggedInUser.uid}</p>
            </div>
          </div>

          <div className="btnRow small">
            <button className="secondaryBtn" onClick={fetchUsers}>
              Refresh
            </button>
            <button className="dangerBtn" onClick={logoutUser}>
              Logout
            </button>
          </div>

          <h3>Users</h3>

          {users.map((user) => {
            const isLoggedInUser = user.uid === loggedInUser.uid;
            const userStatus = isLoggedInUser ? "online" : user.status || "offline";

            return (
              <div
                key={user.uid}
                className={`contact ${
                  selectedContact?.uid === user.uid ? "active" : ""
                }`}
                onClick={() => {
                  setSelectedContact({
                    ...user,
                    status: userStatus,
                  });
                  setMessages([]);
                }}
              >
                <span
                  className={`dot ${
                    userStatus === "online" ? "online" : "offline"
                  }`}
                ></span>

                <div>
                  <strong>
                    {user.name || user.uid}
                    {isLoggedInUser ? " (You)" : ""}
                  </strong>
                  <p>{userStatus} • {user.uid}</p>
                </div>
              </div>
            );
          })}
        </aside>

        <main className="chatBox">
          <div className="chatHeader">
            <h2>
              {selectedContact?.uid === loggedInUser.uid
                ? loggedInUser.name || loggedInUser.uid
                : `Chat with ${selectedContact?.name || selectedContact?.uid}`}
            </h2>

            <p>
              {selectedContact?.uid === loggedInUser.uid
                ? `Online • ${loggedInUser.uid}`
                : `${selectedContact?.status || "offline"} • ${
                    selectedContact?.uid
                  }`}
            </p>
          </div>

          <div className="messages">
            {messages.length === 0 && (
              <div className="empty">
                {selectedContact?.uid === loggedInUser.uid
                  ? "This is your logged-in user dashboard."
                  : `Start chatting with ${
                      selectedContact?.name || selectedContact?.uid
                    }.`}
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`msg ${msg.side}`}>
                {msg.text}
              </div>
            ))}
          </div>

          <div className="inputBar">
            <input
              value={text}
              placeholder={
                selectedContact?.uid === loggedInUser.uid
                  ? "Type a note for your own dashboard..."
                  : `Message ${selectedContact?.name || selectedContact?.uid}...`
              }
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />

            <button onClick={sendMessage}>Send</button>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;