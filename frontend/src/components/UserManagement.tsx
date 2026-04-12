import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Auth, Permissions, License } from "../services/api";

/* ─── Password Generator ─── */
function generatePassword(length = 12): string {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/* ─── Next Available Terminal ID ─── */
function getNextTerminalId(users: any[]): string {
  const usedIds = new Set(users.map(u => u.terminal_id).filter(Boolean));
  for (let i = 1; i <= 99; i++) {
    const id = String(i).padStart(2, "0");
    if (!usedIds.has(id)) return id;
  }
  return "01";
}

export default function UsersManagement() {
  const currentUserRole = localStorage.getItem("role") || "agent";
  const isSuperAdmin = currentUserRole === "super_admin";
  const [users, setUsers] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userForm, setUserForm] = useState({ email: "", first_name: "", last_name: "", password: "", role: "agent", terminal_id: "01" });
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; action: () => void } | null>(null);

  useEffect(() => {
    loadUsers();
    Permissions.getAll().then(data => {
      const roles = Object.keys(data.permissions || {}).filter(r => r !== "super_admin" || isSuperAdmin);
      setAvailableRoles(roles);
    }).catch(() => {});
  }, []);

  const showMsg = (text: string) => { setMessage(text); setTimeout(() => setMessage(""), 5000); };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const usersData = await Auth.getUsers();
      setUsers(usersData.users || []);
    } catch (error: any) { showMsg(`Error loading users: ${error.message}`); }
    finally { setLoading(false); }
  };

  const openUserModal = (user: any = null) => {
    setEditingUser(user);
    setShowPassword(false);
    if (user) {
      setUserForm({ email: user.email, first_name: user.first_name || "", last_name: user.last_name || "", password: "", role: user.role, terminal_id: user.terminal_id || "01" });
    } else {
      const nextId = getNextTerminalId(users);
      setUserForm({ email: "", first_name: "", last_name: "", password: "", role: "agent", terminal_id: nextId });
    }
    setShowUserModal(true);
  };

  const closeUserModal = () => {
    setShowUserModal(false);
    setEditingUser(null);
    setShowPassword(false);
    setUserForm({ email: "", first_name: "", last_name: "", password: "", role: "agent", terminal_id: "01" });
  };

  const handleGeneratePassword = () => {
    const pwd = generatePassword();
    setUserForm({ ...userForm, password: pwd });
    setShowPassword(true);
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(userForm.password);
    showMsg("Password copied to clipboard");
  };

  const handleUserSubmit = async () => {
    try {
      if (!userForm.email.trim()) { showMsg("Email is required"); return; }
      if (!editingUser && !userForm.password.trim()) { showMsg("Password is required for new users"); return; }
      if (userForm.password && userForm.password.length < 6) { showMsg("Password must be at least 6 characters"); return; }

      const userData: any = { email: userForm.email, first_name: userForm.first_name, last_name: userForm.last_name, role: userForm.role, terminal_id: userForm.terminal_id };
      if (userForm.password.trim()) userData.password = userForm.password;

      if (editingUser) {
        await Auth.updateUser(editingUser.id, userData);
        showMsg("User updated successfully!");
      } else {
        await Auth.createUser(userData);
        showMsg("User created successfully!");
      }
      closeUserModal();
      loadUsers();
    } catch (error: any) { showMsg(`Error: ${error.message}`); }
  };

  const deleteUser = (userId: number) => {
    setConfirmModal({
      title: "Delete User",
      message: "Are you sure you want to delete this user? This action cannot be undone.",
      action: async () => {
        try {
          await Auth.deleteUser(userId);
          showMsg("User deleted successfully!");
          loadUsers();
        } catch (error: any) { showMsg(`Error: ${error.message}`); }
      },
    });
  };

  const sendOnboarding = async (user: any) => {
    setActionLoading(`onboard-${user.id}`);
    try {
      await Auth.sendOnboarding(user.id);
      showMsg(`Onboarding email sent to ${user.email}`);
    } catch (error: any) { showMsg(`Error: ${error.message}`); }
    finally { setActionLoading(null); }
  };

  const resetPassword = (user: any) => {
    const name = user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.email;
    setConfirmModal({
      title: "Reset Password",
      message: `Send a password reset email to ${name} (${user.email})?`,
      action: async () => {
        setActionLoading(`reset-${user.id}`);
        try {
          await Auth.resetPassword(user.id);
          showMsg(`Password reset email sent to ${user.email}`);
        } catch (error: any) { showMsg(`Error: ${error.message}`); }
        finally { setActionLoading(null); }
      },
    });
  };

  const roleBadge = (r: string) => {
    const styles: Record<string, string> = {
      super_admin: "bg-rose-600/90 text-white",
      admin: "bg-slate-800/90 text-white",
      dock: "bg-amber-100 text-amber-700 border border-amber-200",
      agent: "bg-violet-100 text-violet-700 border border-violet-200",
    };
    const labels: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", dock: "Dock", agent: "Agent" };
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${styles[r] || styles.agent}`}>{labels[r] || r}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 border-[3px] border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[14px] font-semibold text-slate-700">Loading Users</span>
            <span className="text-[12px] text-slate-400">Fetching user data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-5">
      {/* Messages */}
      {message && (
        <div className={`card p-3 sm:p-3.5 animate-scale-in ${message.includes("Error") ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"}`}>
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2.5 flex-shrink-0 ${message.includes("Error") ? "bg-rose-500" : "bg-emerald-500"}`} />
            <span className={`text-[12px] sm:text-[13px] font-medium ${message.includes("Error") ? "text-rose-700" : "text-emerald-700"}`}>{message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="card p-4 sm:p-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-slate-900 truncate">User Management</h3>
          <p className="text-[11px] text-slate-500 mt-0.5 hidden sm:block">Manage admin and agent user accounts</p>
          <p className="text-[11px] text-slate-500 mt-0.5 sm:hidden">{users.filter(u => isSuperAdmin || u.role !== "super_admin").length} users</p>
        </div>
        <button onClick={() => openUserModal()} className="bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-full px-3 sm:px-4 py-2 text-[12px] sm:text-[13px] flex items-center gap-1.5 transition-colors flex-shrink-0 whitespace-nowrap">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span className="hidden sm:inline">Create User</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Users List */}
      {users.length === 0 ? (
        <div className="card text-center py-16 px-5">
          <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
            </svg>
          </div>
          <h3 className="text-[13px] font-semibold text-slate-900 mb-1">No users found</h3>
          <p className="text-[11px] text-slate-500">Create your first user to get started</p>
        </div>
      ) : (
        <>
          {/* Mobile: Stacked cards */}
          <div className="sm:hidden space-y-2.5">
            {users.filter(u => isSuperAdmin || u.role !== "super_admin").map((user) => {
              const isInactive = user.is_active === 0 || user.is_active === false;
              const createdByName = user.created_by_first_name ? `${user.created_by_first_name} ${user.created_by_last_name || ''}`.trim() : user.created_by_email;
              const displayName = user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.email;
              return (
                <div key={user.id} className={`card p-3.5 ${isInactive ? "bg-slate-50/50 opacity-70" : ""}`}>
                  {/* Top: Avatar + Info + Edit button */}
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold text-[13px] flex-shrink-0 ${isInactive ? "bg-slate-400" : "bg-violet-600"}`} style={{ backgroundColor: isInactive ? undefined : 'var(--color-violet-600)' }}>
                      {(user.first_name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className={`text-[13px] font-semibold truncate ${isInactive ? "text-slate-500 line-through" : "text-slate-900"}`}>
                        {displayName}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        {roleBadge(user.role)}
                        <span className="text-[9px] font-mono font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">T-{user.terminal_id || '01'}</span>
                        {isInactive && <span className="text-[9px] font-semibold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">INACTIVE</span>}
                      </div>
                      {createdByName && <p className="text-[10px] text-slate-400 mt-1 truncate">Created by {createdByName}</p>}
                    </div>
                  </div>

                  {/* Bottom: Actions row — all icon buttons */}
                  <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => sendOnboarding(user)}
                      disabled={actionLoading === `onboard-${user.id}`}
                      className="w-9 h-9 flex items-center justify-center text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                      title="Send onboarding email"
                    >
                      {actionLoading === `onboard-${user.id}` ? (
                        <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      )}
                    </button>
                    <button
                      onClick={() => resetPassword(user)}
                      disabled={actionLoading === `reset-${user.id}`}
                      className="w-9 h-9 flex items-center justify-center text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                      title="Reset password"
                    >
                      {actionLoading === `reset-${user.id}` ? (
                        <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                      )}
                    </button>
                    <button
                      onClick={() => openUserModal(user)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors flex-shrink-0"
                      title="Edit"
                      style={{ color: 'var(--color-violet-600)', backgroundColor: 'color-mix(in srgb, var(--color-violet-500) 10%, white)' }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    {isSuperAdmin && (
                      <button
                        onClick={async () => {
                          try {
                            if (isInactive) {
                              await License.activateUser(user.id);
                              showMsg(`${user.first_name || user.email} reactivated`);
                            } else {
                              await License.deactivateUser(user.id);
                              showMsg(`${user.first_name || user.email} deactivated`);
                            }
                            loadUsers();
                          } catch (e: any) { showMsg(`Error: ${e.message}`); }
                        }}
                        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors flex-shrink-0 ${isInactive ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" : "text-amber-600 bg-amber-50 hover:bg-amber-100"}`}
                        title={isInactive ? "Reactivate user" : "Deactivate user"}
                      >
                        {isInactive ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7zM16 11l2 2 4-4" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => deleteUser(user.id)}
                      className="w-9 h-9 flex items-center justify-center text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors flex-shrink-0"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: List view */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="divide-y divide-slate-50">
              {users.filter(u => isSuperAdmin || u.role !== "super_admin").map((user) => {
                const isInactive = user.is_active === 0 || user.is_active === false;
                const createdByName = user.created_by_first_name ? `${user.created_by_first_name} ${user.created_by_last_name || ''}`.trim() : user.created_by_email;
                return (
                <div key={user.id} className={`p-4 sm:px-5 transition-colors group ${isInactive ? "bg-slate-50/50 opacity-70" : "hover:bg-slate-50/50"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-semibold text-[12px] flex-shrink-0 ${isInactive ? "bg-slate-400" : "bg-violet-600"}`}>
                        {(user.first_name || user.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-3 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`text-[13px] font-semibold truncate ${isInactive ? "text-slate-500 line-through" : "text-slate-900"}`}>
                            {user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.email}
                          </h4>
                          {roleBadge(user.role)}
                          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">T-{user.terminal_id || '01'}</span>
                          {isInactive && <span className="text-[10px] font-semibold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">Deactivated</span>}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {user.email}
                          {createdByName && <span className="ml-2 text-slate-300">· Created by {createdByName}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3">
                      <button onClick={() => sendOnboarding(user)} disabled={actionLoading === `onboard-${user.id}`} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50" title="Send onboarding email">
                        {actionLoading === `onboard-${user.id}` ? (
                          <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        )}
                      </button>
                      <button onClick={() => resetPassword(user)} disabled={actionLoading === `reset-${user.id}`} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50" title="Reset password">
                        {actionLoading === `reset-${user.id}` ? (
                          <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                        )}
                      </button>
                      <button onClick={() => openUserModal(user)} className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors" title="Edit user">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      {isSuperAdmin && (
                        <button
                          onClick={async () => {
                            try {
                              if (isInactive) { await License.activateUser(user.id); showMsg(`${user.first_name || user.email} reactivated`); }
                              else { await License.deactivateUser(user.id); showMsg(`${user.first_name || user.email} deactivated`); }
                              loadUsers();
                            } catch (e: any) { showMsg(`Error: ${e.message}`); }
                          }}
                          className={`p-2 rounded-lg transition-colors ${isInactive ? "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:text-amber-600 hover:bg-amber-50"}`}
                          title={isInactive ? "Reactivate user" : "Deactivate user"}
                        >
                          {isInactive ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7zM16 11l2 2 4-4" /></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                          )}
                        </button>
                      )}
                      <button onClick={() => deleteUser(user.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete user">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* User Modal */}
      {showUserModal && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeUserModal} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-scale-in">
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">{editingUser ? "Edit User" : "Create New User"}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{editingUser ? "Update user account details" : "Add a new team member"}</p>
              </div>
              <button onClick={closeUserModal} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Name fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[12px] font-medium text-slate-600">First Name</label>
                  <input type="text" value={userForm.first_name} onChange={(e) => setUserForm({ ...userForm, first_name: e.target.value })} className="input w-full" placeholder="John" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[12px] font-medium text-slate-600">Last Name</label>
                  <input type="text" value={userForm.last_name} onChange={(e) => setUserForm({ ...userForm, last_name: e.target.value })} className="input w-full" placeholder="Doe" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-medium text-slate-600">Email Address *</label>
                <input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="input w-full" placeholder="user@example.com" />
              </div>

              {/* Password with generator */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[12px] font-medium text-slate-600">Password {editingUser ? "(leave blank to keep)" : "*"}</label>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="text-[11px] font-medium text-violet-600 hover:text-violet-700 flex items-center gap-1 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Generate
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className="input w-full pr-20"
                    placeholder={editingUser ? "Enter new password (optional)" : "Enter password"}
                    minLength={6}
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    {userForm.password && (
                      <button
                        type="button"
                        onClick={copyPassword}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                        title="Copy password"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[12px] font-medium text-slate-600">Role *</label>
                  <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} className="select w-full">
                    {availableRoles.length > 0 ? (
                      availableRoles.map(r => (
                        <option key={r} value={r}>{r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                      ))
                    ) : (
                      <>
                        <option value="agent">Agent</option>
                        <option value="dock">Dock Scanner</option>
                        <option value="admin">Administrator</option>
                        {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                      </>
                    )}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[12px] font-medium text-slate-600">Terminal ID</label>
                  <input type="text" value={userForm.terminal_id} onChange={(e) => setUserForm({ ...userForm, terminal_id: e.target.value })} className="input w-full font-mono text-center" placeholder="01" maxLength={4} />
                  <p className="text-[10px] text-slate-400">Auto-assigned next available</p>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white rounded-b-2xl px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={closeUserModal} className="btn-secondary text-[13px]">Cancel</button>
              <button onClick={handleUserSubmit} className="bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-full px-5 py-2.5 text-[13px] transition-colors">{editingUser ? "Update User" : "Create User"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm Modal */}
      {confirmModal && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmModal(null)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-xs animate-scale-in text-center">
            <div className="px-6 pt-7 pb-5">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-[15px] font-bold text-slate-900 mb-2">{confirmModal.title}</h3>
              <p className="text-[13px] text-slate-500 leading-relaxed">{confirmModal.message}</p>
            </div>
            <div className="px-6 pb-6 flex items-center justify-center gap-3">
              <button onClick={() => setConfirmModal(null)} className="flex-1 px-4 py-2.5 text-[13px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
                Cancel
              </button>
              <button
                onClick={() => { confirmModal.action(); setConfirmModal(null); }}
                className="flex-1 px-4 py-2.5 text-[13px] font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-full transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
