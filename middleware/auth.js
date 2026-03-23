function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Non autenticato' });
  }
  req.user = { id: req.session.userId, email: req.session.userEmail };
  next();
}

module.exports = { requireAuth };
