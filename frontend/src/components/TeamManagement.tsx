import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Auth } from "../services/api";

const PRESET_COLORS = ["#0d9488", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#dc2626", "#ca8a04"];
const ROLE_STYLES = { admin: "bg-violet-100 text-violet-700", agent: "bg-violet-100 text-violet-700", dock: "bg-amber-100 text-amber-700" };

export default function TeamManagement() {
  const currentUserRole = localStorage.getItem("role") || "agent";
  const isSuperAdmin = currentUserRole === "super_admin";
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  // Modals
  const [teamModal, setTeamModal] = useState(null); // null | { mode: 'create' } | { mode: 'edit', team }
  const [teamForm, setTeamForm] = useState({ name: "", team_code: "", description: "", color: "#0d9488" });
  const [terminalModal, setTerminalModal] = useState(null); // null | { user, terminal_id }

  // Inline team code edit
  const [editingTeamCode, setEditingTeamCode] = useState(null); // null | { teamId, value }

  // Drag state
  const [dragUser, setDragUser] = useState(null);
  const [dragOverTeam, setDragOverTeam] = useState(null); // team id or 'unassigned'

  const showMsg = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [teamsRes, usersRes] = await Promise.all([Auth.getTeams(), Auth.getUsers()]);
      setTeams(teamsRes.teams || []);
      // Hide super_admin users from anyone who isn't a super_admin
      const allUsers = usersRes.users || [];
      setUsers(isSuperAdmin ? allUsers : allUsers.filter((u) => u.role !== "super_admin"));
    } catch (e) {
      showMsg("Failed to load data: " + e.message, true);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  // Helpers
  const unassigned = users.filter(u => !u.team_id);
  const getTeamMembers = (teamId) => users.filter(u => u.team_id === teamId);
  const displayName = (u) => u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.first_name || u.email?.split("@")[0] || "Unknown";
  const getInitial = (u) => (u.first_name || u.email || "?").charAt(0).toUpperCase();

  // Team CRUD
  const getNextTeamCode = () => {
    const usedCodes = new Set(teams.map(t => t.team_code).filter(Boolean));
    for (let i = 1; i <= 99; i++) {
      const code = String(i).padStart(2, "0");
      if (!usedCodes.has(code)) return code;
    }
    return "01";
  };

  const openCreateTeam = () => {
    setTeamForm({ name: "", team_code: getNextTeamCode(), description: "", color: "#0d9488" });
    setTeamModal({ mode: "create" });
  };
  const openEditTeam = (team) => {
    setTeamForm({ name: team.name, team_code: team.team_code || "", description: team.description || "", color: team.color || "#0d9488" });
    setTeamModal({ mode: "edit", team });
  };
  const closeTeamModal = () => setTeamModal(null);

  const saveTeam = async () => {
    if (!teamForm.name.trim()) return showMsg("Team name is required", true);
    try {
      if (teamModal.mode === "create") {
        await Auth.createTeam(teamForm);
        showMsg("Team created");
      } else {
        await Auth.updateTeam(teamModal.team.id, teamForm);
        showMsg("Team updated");
      }
      closeTeamModal();
      loadData();
    } catch (e) { showMsg(e.message, true); }
  };

  const deleteTeam = async (id) => {
    if (!window.confirm("Delete this team? Members will become unassigned.")) return;
    try {
      await Auth.deleteTeam(id);
      showMsg("Team deleted");
      loadData();
    } catch (e) { showMsg(e.message, true); }
  };

  // Inline team code edit
  const saveTeamCode = async (teamId, newCode) => {
    try {
      await Auth.updateTeam(teamId, { team_code: newCode });
      setEditingTeamCode(null);
      loadData();
    } catch (e) { showMsg(e.message, true); }
  };

  // Drag & Drop
  const handleDragStart = (e, user) => {
    setDragUser(user);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(user.id));
  };

  const handleDragOver = (e, targetId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTeam(targetId);
  };

  const handleDragLeave = () => setDragOverTeam(null);

  const handleDrop = async (e, targetTeamId) => {
    e.preventDefault();
    setDragOverTeam(null);
    if (!dragUser) return;

    const newTeamId = targetTeamId === "unassigned" ? null : targetTeamId;
    if (dragUser.team_id === newTeamId) { setDragUser(null); return; }

    try {
      await Auth.assignUserToTeam({ user_id: dragUser.id, team_id: newTeamId });
      setDragUser(null);
      loadData();
    } catch (e) { showMsg(e.message, true); setDragUser(null); }
  };

  // Terminal edit
  const openTerminalEdit = (user) => setTerminalModal({ user, terminal_id: user.terminal_id || "" });
  const closeTerminalEdit = () => setTerminalModal(null);
  const clearTerminal = async () => {
    if (!terminalModal) return;
    try {
      await Auth.updateUser(terminalModal.user.id, { terminal_id: null });
      showMsg("Terminal ID cleared");
      closeTerminalEdit();
      loadData();
    } catch (e) { showMsg(e.message, true); }
  };
  const saveTerminal = async () => {
    if (!terminalModal) return;
    const val = terminalModal.terminal_id.trim();
    try {
      await Auth.updateUser(terminalModal.user.id, { terminal_id: val || null });
      showMsg(val ? "Terminal ID updated" : "Terminal ID cleared");
      closeTerminalEdit();
      loadData();
    } catch (e) { showMsg(e.message, true); }
  };

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 border-[3px] border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[14px] font-semibold text-slate-700">Loading Teams</span>
            <span className="text-[12px] text-slate-400">Fetching team data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-8 space-y-3 sm:space-y-8">
      {/* Toast */}
      {message && (
        <div className={`fixed top-4 right-4 z-[80] px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-scale-in ${message.isError ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"}`}>
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] sm:text-2xl font-bold text-slate-900 truncate">Team Management</h1>
          <p className="text-[11px] sm:text-sm text-slate-500 mt-0.5 hidden sm:block">Organize teams, assign terminals, and manage staff</p>
          <p className="text-[11px] text-slate-500 mt-0.5 sm:hidden">{teams.length} teams &middot; {unassigned.length} unassigned</p>
        </div>
        <button onClick={openCreateTeam} className="btn-primary flex items-center gap-1.5 text-[12px] sm:text-sm px-3 sm:px-5 flex-shrink-0 whitespace-nowrap">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="hidden sm:inline">Create Team</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Stats — horizontal 3-column on mobile */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-[20px] sm:text-2xl font-bold text-slate-900">{teams.length}</p>
          <p className="text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5">Teams</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-[20px] sm:text-2xl font-bold" style={{ color: 'var(--color-violet-600)' }}>{users.filter(u => u.team_id).length}</p>
          <p className="text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5">Assigned</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-[20px] sm:text-2xl font-bold text-amber-600">{unassigned.length}</p>
          <p className="text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5">Unassigned</p>
        </div>
      </div>

      {/* Team Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-6">
        {teams.map((team) => {
          const members = getTeamMembers(team.id);
          const isOver = dragOverTeam === team.id;
          return (
            <div
              key={team.id}
              className={`glass-card overflow-hidden transition-all duration-300 ${isOver ? "ring-2 ring-violet-500 scale-[1.01]" : ""}`}
              onDragOver={(e) => handleDragOver(e, team.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, team.id)}
            >
              {/* Team Header */}
              <div className="px-3 sm:px-5 py-3 sm:py-4 flex items-center justify-between gap-2" style={{ borderBottom: `3px solid ${team.color}` }}>
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ backgroundColor: team.color }}>
                    {team.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 truncate">{team.name}</h3>
                      {team.team_code && team.team_code !== '00' && (
                        editingTeamCode?.teamId === team.id ? (
                          <input
                            autoFocus
                            type="text"
                            maxLength={4}
                            value={editingTeamCode.value}
                            onChange={(e) => setEditingTeamCode({ ...editingTeamCode, value: e.target.value })}
                            onBlur={() => saveTeamCode(team.id, editingTeamCode.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveTeamCode(team.id, editingTeamCode.value); if (e.key === 'Escape') setEditingTeamCode(null); }}
                            className="font-mono text-[10px] font-bold text-slate-600 w-10 px-1 py-0.5 rounded border border-violet-400 bg-white text-center outline-none ring-2 ring-violet-200"
                          />
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingTeamCode({ teamId: team.id, value: team.team_code }); }}
                            className="font-mono text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 hover:border-violet-300 hover:bg-violet-50 transition-colors cursor-pointer"
                            title="Click to edit team code"
                          >
                            #{team.team_code}
                          </button>
                        )
                      )}
                    </div>
                    {team.description && <p className="text-xs text-slate-400 truncate">{team.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{members.length}</span>
                  <button onClick={() => openEditTeam(team)} className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors" title="Edit team">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                  </button>
                  <button onClick={() => deleteTeam(team.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete team">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Members */}
              <div className="p-2 sm:p-3 space-y-1.5 min-h-[80px] sm:min-h-[100px]">
                {members.length === 0 && !isOver && (
                  <div className="text-center py-5 text-slate-400">
                    <p className="text-[11px] sm:text-xs font-medium">
                      <span className="hidden sm:inline">Drop members here</span>
                      <span className="sm:hidden">No members yet</span>
                    </p>
                  </div>
                )}
                {isOver && members.length === 0 && (
                  <div className="text-center py-6 border-2 border-dashed border-violet-300 rounded-xl bg-violet-50/50">
                    <p className="text-xs font-semibold text-violet-600">Release to add</p>
                  </div>
                )}
                {members.map((m) => (
                  <div
                    key={m.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, m)}
                    className="flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm sm:cursor-grab sm:active:cursor-grabbing transition-all duration-200"
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: team.color }}>
                      {getInitial(m)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] sm:text-sm font-semibold text-slate-900 truncate">{displayName(m)}</p>
                      <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">{m.email}</p>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                      <span className={`text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded ${ROLE_STYLES[m.role] || "bg-slate-100 text-slate-600"}`}>
                        {m.role}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); openTerminalEdit(m); }}
                        className="font-mono text-[9px] sm:text-[10px] font-bold bg-slate-800 text-white px-1.5 py-0.5 rounded hover:bg-violet-600 transition-colors cursor-pointer"
                        title="Edit terminal ID"
                      >
                        {m.terminal_id ? `T-${m.terminal_id}` : "None"}
                      </button>
                      {/* Mobile: unassign button */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await Auth.assignUserToTeam({ user_id: m.id, team_id: null });
                            await loadData();
                            showMsg('Member removed from team');
                          } catch (err: any) { showMsg(err.message || 'Failed', true); }
                        }}
                        className="sm:hidden w-6 h-6 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="Remove from team"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Empty state if no teams */}
        {teams.length === 0 && (
          <div className="col-span-full glass-card p-12 text-center">
            <svg className="w-16 h-16 text-slate-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <h3 className="text-lg font-bold text-slate-900">No teams yet</h3>
            <p className="text-sm text-slate-500 mt-1 mb-4">Create your first team to start organizing staff</p>
            <button onClick={openCreateTeam} className="btn-primary text-sm">Create Team</button>
          </div>
        )}
      </div>

      {/* Unassigned Users */}
      <div
        className={`glass-card overflow-hidden transition-all duration-300 ${dragOverTeam === "unassigned" ? "ring-2 ring-amber-500 scale-[1.005]" : ""}`}
        onDragOver={(e) => handleDragOver(e, "unassigned")}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, "unassigned")}
      >
        <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-slate-200/40 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-[13px] sm:text-sm font-bold text-slate-800 truncate">Unassigned</h2>
            <span className="text-[10px] sm:text-xs font-bold text-amber-600 bg-amber-50 px-1.5 sm:px-2 py-0.5 rounded-full border border-amber-200 flex-shrink-0">{unassigned.length}</span>
          </div>
          <p className="text-[10px] sm:text-xs text-slate-400 hidden sm:block">Drag users to a team above to assign them</p>
          <p className="text-[10px] text-slate-400 sm:hidden">Tap + to assign</p>
        </div>

        <div className="p-2 sm:p-4">
          {unassigned.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p className="text-[12px] sm:text-sm font-medium">All users are assigned to teams</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {unassigned.map((u) => (
                <div
                  key={u.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, u)}
                  className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm sm:cursor-grab sm:active:cursor-grabbing transition-all duration-200"
                >
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-sm font-bold flex-shrink-0">
                    {getInitial(u)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] sm:text-sm font-semibold text-slate-900 truncate">{displayName(u)}</p>
                    <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                    <span className={`text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded ${ROLE_STYLES[u.role] || "bg-slate-100 text-slate-600"}`}>
                      {u.role}
                    </span>
                    {/* Mobile: assign-to-team dropdown */}
                    <select
                      value=""
                      onChange={async (e) => {
                        const teamId = e.target.value;
                        if (!teamId) return;
                        try {
                          await Auth.assignUserToTeam({ user_id: u.id, team_id: parseInt(teamId) });
                          await loadData();
                          showMsg('Member added to team');
                        } catch (err: any) { showMsg(err.message || 'Failed', true); }
                      }}
                      className="sm:hidden text-[10px] font-semibold bg-violet-600 text-white px-2 py-1 rounded border-0 cursor-pointer"
                      style={{ backgroundColor: 'var(--color-violet-600)' }}
                      title="Assign to team"
                    >
                      <option value="">+ Assign</option>
                      {teams.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Create/Edit Team Modal ═══ */}
      {teamModal && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 " onClick={closeTeamModal} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">{teamModal.mode === "create" ? "Create Team" : "Edit Team"}</h3>
              <button onClick={closeTeamModal} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Team Name *</label>
                  <input type="text" value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} className="glass-input w-full" placeholder="e.g. Suva Terminal" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Team Code</label>
                  <input type="text" value={teamForm.team_code} onChange={(e) => setTeamForm({ ...teamForm, team_code: e.target.value })} className="input w-full font-mono text-center tracking-widest" placeholder="01" maxLength={4} />
                  <p className="text-[10px] text-slate-400 mt-1">Auto-assigned next available</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                <textarea value={teamForm.description} onChange={(e) => setTeamForm({ ...teamForm, description: e.target.value })} className="glass-input w-full" rows={2} placeholder="Optional team description" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Team Color</label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setTeamForm({ ...teamForm, color: c })}
                      className={`w-9 h-9 rounded-xl transition-all duration-200 ${teamForm.color === c ? "ring-2 ring-offset-2 ring-slate-900 scale-110" : "hover:scale-105"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={closeTeamModal} className="btn-secondary text-sm">Cancel</button>
              <button onClick={saveTeam} className="btn-primary text-sm">{teamModal.mode === "create" ? "Create" : "Save"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ═══ Terminal ID Edit Modal ═══ */}
      {terminalModal && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 " onClick={closeTerminalEdit} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-scale-in">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Edit Terminal ID</h3>
              <p className="text-xs text-slate-500 mt-0.5">{displayName(terminalModal.user)} ({terminalModal.user.email})</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Terminal ID (must be unique)</label>
                <input
                  type="text"
                  value={terminalModal.terminal_id}
                  onChange={(e) => setTerminalModal({ ...terminalModal, terminal_id: e.target.value })}
                  className="glass-input w-full font-mono text-lg text-center tracking-widest"
                  placeholder="None"
                  maxLength={4}
                />
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-xs text-slate-500 mb-2">To swap two terminal IDs: set one to None first, assign the freed ID to the other user, then set the first user's new ID.</p>
                <button
                  onClick={clearTerminal}
                  className="text-xs font-medium text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-200 transition-colors"
                >
                  Set to None (unassign terminal)
                </button>
              </div>
              <p className="text-[10px] text-slate-400">Appears in ticket IDs as: {terminalModal.terminal_id ? `XX-${terminalModal.terminal_id}-DDMMYYYY-0001` : 'No terminal assigned'}</p>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={closeTerminalEdit} className="btn-secondary text-sm">Cancel</button>
              <button onClick={saveTerminal} className="btn-primary text-sm">{terminalModal.terminal_id.trim() ? 'Save' : 'Clear Terminal'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
