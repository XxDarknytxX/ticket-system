const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

export function makeTicketLayoutController(pool) {
  return {
    // GET /api/ticket-layouts
    getAll: async (_req, res) => {
      try {
        const [rows] = await pool.query(
          "SELECT id, name, is_default, layout_data, created_by, created_at, updated_at FROM ticket_layouts ORDER BY is_default DESC, name ASC"
        );
        // Parse JSON
        const layouts = rows.map(r => ({
          ...r,
          layout_data: typeof r.layout_data === 'string' ? JSON.parse(r.layout_data) : r.layout_data,
        }));
        return send.ok(res, { layouts });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/ticket-layouts/:id
    getById: async (req, res) => {
      try {
        const [rows] = await pool.query("SELECT * FROM ticket_layouts WHERE id = ?", [req.params.id]);
        if (rows.length === 0) return send.notFound(res, "Layout not found");
        const layout = rows[0];
        layout.layout_data = typeof layout.layout_data === 'string' ? JSON.parse(layout.layout_data) : layout.layout_data;
        return send.ok(res, { layout });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/ticket-layouts
    create: async (req, res) => {
      if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
      const { name, layout_data } = req.body;
      if (!name) return send.bad(res, "Layout name is required");
      if (!layout_data) return send.bad(res, "Layout data is required");
      try {
        const jsonStr = typeof layout_data === 'string' ? layout_data : JSON.stringify(layout_data);
        const [result] = await pool.query(
          "INSERT INTO ticket_layouts (name, is_default, layout_data, created_by) VALUES (?, FALSE, ?, ?)",
          [name, jsonStr, req.user.id]
        );
        const [rows] = await pool.query("SELECT * FROM ticket_layouts WHERE id = ?", [result.insertId]);
        const layout = rows[0];
        layout.layout_data = typeof layout.layout_data === 'string' ? JSON.parse(layout.layout_data) : layout.layout_data;
        return send.created(res, { layout });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PUT /api/ticket-layouts/:id
    update: async (req, res) => {
      if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
      const { id } = req.params;
      const { name, layout_data } = req.body;
      try {
        const fields = [];
        const vals = [];
        if (name) { fields.push("name = ?"); vals.push(name); }
        if (layout_data) {
          const jsonStr = typeof layout_data === 'string' ? layout_data : JSON.stringify(layout_data);
          fields.push("layout_data = ?");
          vals.push(jsonStr);
        }
        if (fields.length === 0) return send.bad(res, "Nothing to update");
        vals.push(id);
        await pool.query(`UPDATE ticket_layouts SET ${fields.join(", ")} WHERE id = ?`, vals);
        const [rows] = await pool.query("SELECT * FROM ticket_layouts WHERE id = ?", [id]);
        if (rows.length === 0) return send.notFound(res);
        const layout = rows[0];
        layout.layout_data = typeof layout.layout_data === 'string' ? JSON.parse(layout.layout_data) : layout.layout_data;
        return send.ok(res, { layout });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/ticket-layouts/:id
    delete: async (req, res) => {
      if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
      const { id } = req.params;
      try {
        // Don't allow deleting the default layout
        const [check] = await pool.query("SELECT is_default FROM ticket_layouts WHERE id = ?", [id]);
        if (check.length === 0) return send.notFound(res);
        if (check[0].is_default) return send.bad(res, "Cannot delete the default layout");
        await pool.query("DELETE FROM ticket_layouts WHERE id = ?", [id]);
        return send.ok(res, { message: "Layout deleted" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
