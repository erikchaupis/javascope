<%@ page language="java" %>
<html>
<body>
<c:if test="${not empty user && user.active}">
<p class="${user.vip ? 'vip' : 'normal'}">Welcome ${user.name}</p>
</c:if>
<input value="${fn:escapeXml(user.bio)}" size="40"/>
</body>
</html>
