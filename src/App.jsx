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
  const listenerIdRef = useRef("whatsapp_style_listener");
  const typingTimerRef = useRef(null);

  const [users, setUsers] = useState([]);
  const [loginUid, setLoginUid] = useState("");
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);

  const [messagesByUser, setMessagesByUser] = useState({});
  const [unreadByUser, setUnreadByUser] = useState({});
  const [typingUsers, setTypingUsers] = useState({});

  const [text, setText] = useState("");
  const [newUid, setNewUid] = useState("");
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState("Loading users...");
  const [loading, setLoading] = useState(false);
  
  const [contextMenu, setContextMenu] = useState(null);
  const [showUserManagement, setShowUserManagement] = useState(false);

  const activeMessages = selectedContact
    ? messagesByUser[selectedContact.uid] || []
    : [];

  const formatMessage = (m, currentUid) => {
    const isDeleted = Boolean(m.deletedAt);
    return {
      id: m.id || Date.now(),
      text: isDeleted ? "This message was deleted" : m.text || "",
      side: m.sender?.uid === currentUid ? "right" : "left",
      senderUid: m.sender?.uid,
      receiverUid: m.receiverId,
      raw: m,
      deleted: isDeleted,
      sentAt: m.sentAt || Math.floor(Date.now() / 1000),
    };
  };

  const setChatMessages = (uid, updater) => {
    setMessagesByUser((prev) => {
      const oldList = prev[uid] || [];
      const newList = typeof updater === "function" ? updater(oldList) : updater;
      return { ...prev, [uid]: newList };
    });
  };

  const fetchUsers = async () => {
    try {
      setStatus("Fetching users...");
      const res = await fetch(`${API_BASE}/users?perPage=100&page=1`, {
        headers: {
          apikey: REST_API_KEY,
          accept: "application/json",
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to fetch users");

      const fetched = data?.data || [];
      setUsers(fetched);

      if (!loginUid && fetched.length > 0) {
        setLoginUid(fetched[0].uid);
      }

      setStatus("Users loaded successfully");
    } catch (err) {
      setStatus("Fetch users error: " + err.message);
    }
  };

  const createUser = async () => {
    if (!newUid.trim() || !newName.trim()) {
      alert("Enter UID and Name");
      return;
    }

    try {
      setStatus("Creating user...");
      const res = await fetch(`${API_BASE}/users`, {
        method: "POST",
        headers: {
          apikey: REST_API_KEY,
          accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid: newUid.trim(),
          name: newName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Create user failed");

      setNewUid("");
      setNewName("");
      await fetchUsers();
      setStatus("User created successfully");
    } catch (err) {
      alert("Create user error: " + err.message);
    }
  };

  const deleteUser = async (uid) => {
    if (uid === loggedInUser?.uid) {
      alert("You cannot delete the logged-in user.");
      return;
    }

    const ok = confirm(`Delete user ${uid}?`);
    if (!ok) return;

    try {
      setStatus("Deleting user...");
      const res = await fetch(`${API_BASE}/users/${uid}`, {
        method: "DELETE",
        headers: {
          apikey: REST_API_KEY,
          accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ permanent: false }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Delete user failed");

      if (selectedContact?.uid === uid) {
        setSelectedContact(null);
        setText("");
      }

      setMessagesByUser((prev) => {
        const copy = { ...prev };
        delete copy[uid];
        return copy;
      });

      await fetchUsers();
      setStatus("User deleted successfully");
    } catch (err) {
      alert("Delete user error: " + err.message);
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

  const loadOldMessages = async (contact) => {
    if (!contact || !loggedInUser || contact.uid === loggedInUser.uid) return;

    try {
      setStatus("Loading old messages...");

      const request = new CometChat.MessagesRequestBuilder()
        .setUID(contact.uid)
        .setLimit(50)
        .build();

      const oldMessages = await request.fetchPrevious();

      const formatted = oldMessages
        .filter((m) => m.type === CometChat.MESSAGE_TYPE.TEXT)
        .map((m) => formatMessage(m, loggedInUser.uid));

      setChatMessages(contact.uid, formatted);
      setUnreadByUser((prev) => ({ ...prev, [contact.uid]: 0 }));
      setStatus("Messages loaded");
    } catch (err) {
      setStatus("Message history error: " + (err?.message || JSON.stringify(err)));
    }
  };

  const startMessageListener = () => {
    CometChat.removeMessageListener(listenerIdRef.current);

    CometChat.addMessageListener(
      listenerIdRef.current,
      new CometChat.MessageListener({
        onTextMessageReceived: (message) => {
          const senderUid = message.sender?.uid;
          if (!senderUid) return;

          const formatted = formatMessage(message, loggedInUser.uid);

          setChatMessages(senderUid, (prev) => [...prev, formatted]);

          if (selectedContact?.uid !== senderUid) {
            setUnreadByUser((prev) => ({
              ...prev,
              [senderUid]: (prev[senderUid] || 0) + 1,
            }));
          }
        },

        onTypingStarted: (typingIndicator) => {
          const senderUid = typingIndicator?.sender?.uid;
          if (!senderUid) return;

          setTypingUsers((prev) => ({ ...prev, [senderUid]: true }));
        },

        onTypingEnded: (typingIndicator) => {
          const senderUid = typingIndicator?.sender?.uid;
          if (!senderUid) return;

          setTypingUsers((prev) => ({ ...prev, [senderUid]: false }));
        },

        onMessageDeleted: (message) => {
          const deletedId = message?.deletedMessage?.id || message?.id;

          setMessagesByUser((prev) => {
            const updated = {};
            Object.keys(prev).forEach((uid) => {
              updated[uid] = prev[uid].map((m) =>
                String(m.id) === String(deletedId)
                  ? { ...m, text: "This message was deleted", deleted: true }
                  : m
              );
            });
            return updated;
          });
        },
      })
    );
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (loggedInUser) startMessageListener();

    return () => {
      CometChat.removeMessageListener(listenerIdRef.current);
    };
  }, [loggedInUser, selectedContact]);

  const loginSelectedUser = async () => {
    if (!loginUid) {
      alert("Select a user");
      return;
    }

    try {
      setLoading(true);
      setStatus("Initializing CometChat...");

      await initCometChat();

      const oldUser = await CometChat.getLoggedinUser();
      if (oldUser) await CometChat.logout();

      setStatus("Logging in...");
      const user = await CometChat.login(loginUid, AUTH_KEY);

      setLoggedInUser(user);
      setSelectedContact(null);
      setMessagesByUser({});
      setUnreadByUser({});
      setTypingUsers({});
      setStatus(`${user.name || user.uid} is online`);

      await fetchUsers();
    } catch (err) {
      setStatus("Login error: " + (err?.message || JSON.stringify(err)));
    } finally {
      setLoading(false);
    }
  };

  const logoutUser = async () => {
    try {
      CometChat.removeMessageListener(listenerIdRef.current);
      await CometChat.logout();
    } catch {}

    setLoggedInUser(null);
    setSelectedContact(null);
    setMessagesByUser({});
    setUnreadByUser({});
    setTypingUsers({});
    setText("");
    setStatus("Logged out");
    await fetchUsers();
  };

  const selectContact = async (user) => {
    setSelectedContact(user);
    setText("");

    if (user.uid !== loggedInUser.uid) {
      await loadOldMessages(user);
    }
  };

  const handleTyping = (value) => {
    setText(value);

    if (!selectedContact || selectedContact.uid === loggedInUser.uid) return;

    const receiverId = selectedContact.uid;
    const receiverType = CometChat.RECEIVER_TYPE.USER;
    const typingNotification = new CometChat.TypingIndicator(
      receiverId,
      receiverType
    );

    CometChat.startTyping(typingNotification);

    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      CometChat.endTyping(typingNotification);
    }, 1200);
  };

  const sendMessage = async () => {
    if (!selectedContact) {
      alert("Select a user first");
      return;
    }

    if (selectedContact.uid === loggedInUser.uid) {
      alert("Select another user to send a real CometChat message.");
      return;
    }

    if (!text.trim()) return;

    try {
      const msg = new CometChat.TextMessage(
        selectedContact.uid,
        text.trim(),
        CometChat.RECEIVER_TYPE.USER
      );

      const sent = await CometChat.sendMessage(msg);
      const formatted = formatMessage(sent, loggedInUser.uid);

      setChatMessages(selectedContact.uid, (prev) => [...prev, formatted]);
      setText("");
      setStatus("Message sent successfully");
    } catch (err) {
      alert("Message failed: " + (err?.message || JSON.stringify(err)));
    }
  };

  const deleteMessage = async (message) => {
    if (!message?.id || message.deleted) return;

    const ok = confirm("Delete this message?");
    if (!ok) return;

    try {
      await CometChat.deleteMessage(message.id);

      setMessagesByUser((prev) => {
        const copy = { ...prev };
        Object.keys(copy).forEach((uid) => {
          copy[uid] = copy[uid].map((m) =>
            m.id === message.id
              ? { ...m, text: "This message was deleted", deleted: true }
              : m
          );
        });
        return copy;
      });

      setStatus("Message deleted");
    } catch (err) {
      alert("Delete message failed: " + (err?.message || JSON.stringify(err)));
    }
  };

  const renderTime = (unix) => {
    if (!unix) return "";
    return new Date(unix * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleMessageContextMenu = (e, message) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      messageId: message.id,
    });
  };

  const handleMessageLongPress = (message) => {
    setContextMenu({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      messageId: message.id,
    });
  };

  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null);
    document.addEventListener("click", handleCloseMenu);
    return () => document.removeEventListener("click", handleCloseMenu);
  }, []);

  if (!loggedInUser) {
    return (
      <div className="app">
        <div className="loginCard">
          <span className="badge">Mini WhatsApp with CometChat</span>
          <h1>Select User</h1>
          <p>Login as a real CometChat user. Users are synced from dashboard.</p>

          <select value={loginUid} onChange={(e) => setLoginUid(e.target.value)}>
            {users.map((u) => (
              <option key={u.uid} value={u.uid}>
                {(u.name || u.uid) + " - " + u.uid}
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

          <div className="createBox">
            <h3>Add New User</h3>
            <input
              placeholder="UID e.g. himanshu_01"
              value={newUid}
              onChange={(e) => setNewUid(e.target.value)}
            />
            <input
              placeholder="Name e.g. Himanshu Goswami"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button onClick={createUser}>Create User</button>
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
            <button className="secondaryBtn" onClick={() => setShowUserManagement(true)}>
              User Management
            </button>
          </div>

          <div className="createBox smallCreate">
            <h3>Add User</h3>
            <input
              placeholder="UID"
              value={newUid}
              onChange={(e) => setNewUid(e.target.value)}
            />
            <input
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button onClick={createUser}>Add</button>
          </div>

          <h3>Users</h3>

          {users.map((user) => {
            const isMe = user.uid === loggedInUser.uid;
            const userStatus = isMe ? "online" : user.status || "offline";
            const unread = unreadByUser[user.uid] || 0;
            const isTyping = typingUsers[user.uid];

            return (
              <div
                key={user.uid}
                className={`contact ${
                  selectedContact?.uid === user.uid ? "active" : ""
                }`}
              >
                <div className="contactMain" onClick={() => selectContact(user)}>
                  <span
                    className={`dot ${
                      userStatus === "online" ? "online" : "offline"
                    }`}
                  ></span>

                  <div className="contactText">
                    <strong>
                      {user.name || user.uid}
                      {isMe ? " (You)" : ""}
                    </strong>
                    <p>
                      {isTyping
                        ? "typing..."
                        : `${userStatus} • ${user.uid}`}
                    </p>
                  </div>

                  {unread > 0 && <span className="unread">{unread}</span>}
                </div>
              </div>
            );
          })}
        </aside>

        <main className="chatBox">
          <div className="chatHeader">
            <div>
              <h2>
                {selectedContact
                  ? selectedContact.uid === loggedInUser.uid
                    ? loggedInUser.name || loggedInUser.uid
                    : selectedContact.name || selectedContact.uid
                  : loggedInUser.name || loggedInUser.uid}
              </h2>

              <p>
                {selectedContact
                  ? typingUsers[selectedContact.uid]
                    ? "typing..."
                    : `${selectedContact.uid === loggedInUser.uid ? "online" : selectedContact.status || "offline"} • ${selectedContact.uid}`
                  : `Online • ${loggedInUser.uid}`}
              </p>
            </div>
          </div>

          <div className="messages">
            {activeMessages.length === 0 && (
              <div className="empty">
                {selectedContact
                  ? selectedContact.uid === loggedInUser.uid
                    ? "This is your dashboard. Select another user to chat."
                    : "No messages yet. Send your first message."
                  : "Select a user from the left side to start chatting."}
              </div>
            )}

            {activeMessages.map((m) => (
              <div 
                key={m.id} 
                className={`msg ${m.side} ${m.deleted ? "deleted" : ""}`}
                onContextMenu={(e) => handleMessageContextMenu(e, m)}
                onTouchStart={() => {
                  const touchStart = Date.now();
                  const handler = () => {
                    if (Date.now() - touchStart > 500) {
                      handleMessageLongPress(m);
                    }
                  };
                  const timeoutId = setTimeout(handler, 500);
                  const cleanup = () => clearTimeout(timeoutId);
                  document.addEventListener('touchend', cleanup, { once: true });
                }}
              >
                <span>{m.text}</span>

                <div className="msgMeta">
                  <small>{renderTime(m.sentAt)}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="inputBar">
            <input
              value={text}
              disabled={!selectedContact || selectedContact.uid === loggedInUser.uid}
              placeholder={
                selectedContact && selectedContact.uid !== loggedInUser.uid
                  ? `Message ${selectedContact.name || selectedContact.uid}...`
                  : "Select another user first"
              }
              onChange={(e) => handleTyping(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />

            <button
              disabled={!selectedContact || selectedContact.uid === loggedInUser.uid}
              onClick={sendMessage}
            >
              Send
            </button>
          </div>

          <div className="status bottomStatus">{status}</div>

          {contextMenu && (
            <div className="contextMenu" style={{ top: contextMenu.y, left: contextMenu.x }}>
              <button 
                onClick={() => {
                  const msg = activeMessages.find(m => m.id === contextMenu.messageId);
                  if (msg) deleteMessage(msg);
                  setContextMenu(null);
                }}
              >
                Delete Message
              </button>
            </div>
          )}
        </main>

        {showUserManagement && (
          <div className="modal" onClick={() => setShowUserManagement(false)}>
            <div className="modalContent" onClick={(e) => e.stopPropagation()}>
              <div className="modalHeader">
                <h2>User Management</h2>
                <button className="closeBtn" onClick={() => setShowUserManagement(false)}>✕</button>
              </div>
              
              <div className="modalBody">
                <section className="managementSection">
                  <h3>Add New User</h3>
                  <input
                    placeholder="UID e.g. user_01"
                    value={newUid}
                    onChange={(e) => setNewUid(e.target.value)}
                  />
                  <input
                    placeholder="Name e.g. John Doe"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <button onClick={() => { createUser(); setShowUserManagement(false); }}>Create User</button>
                </section>

                <hr style={{ margin: "24px 0", borderColor: "rgba(255,255,255,0.1)" }} />

                <section className="managementSection">
                  <h3>Delete User</h3>
                  <div className="userList">
                    {users.map((user) => {
                      const isMe = user.uid === loggedInUser.uid;
                      return (
                        <div key={user.uid} className="userItem">
                          <div>
                            <strong>{user.name || user.uid}</strong>
                            <p>{user.uid} {isMe ? "(You)" : ""}</p>
                          </div>
                          {!isMe && (
                            <button 
                              className="dangerBtn miniSize" 
                              onClick={() => {
                                deleteUser(user.uid);
                                setShowUserManagement(false);
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;